import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ProcessingStatus, Provider, Prisma } from '@online-vip-crm/database';
import { hashPayload } from '@online-vip-crm/shared';
import type { EnvConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildWebhookIdempotencyKey,
  isDuplicateWebhookEvent,
  resolveWebhookExternalId,
} from '../../common/helpers/webhook-idempotency';

export type MetaChannel = 'whatsapp' | 'instagram' | 'messenger';

const CHANNEL_TO_PROVIDER: Record<MetaChannel, Provider> = {
  whatsapp: Provider.WHATSAPP,
  instagram: Provider.INSTAGRAM,
  messenger: Provider.FACEBOOK,
};

@Injectable()
export class MetaWebhooksService {
  private readonly logger = new Logger(MetaWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  verifySubscription(params: {
    mode?: string;
    verifyToken?: string;
    challenge?: string;
  }): string {
    const expected = this.config.get('META_VERIFY_TOKEN', { infer: true });
    if (
      params.mode === 'subscribe' &&
      expected &&
      params.verifyToken === expected &&
      params.challenge
    ) {
      return params.challenge;
    }
    throw new UnauthorizedException('Webhook verification failed');
  }

  /** Stub signature validation. Accepts when META_APP_SECRET is empty (dev). */
  validateSignature(
    rawBody: Buffer | string,
    signatureHeader?: string,
  ): boolean {
    const secret = this.config.get('META_APP_SECRET', { infer: true });
    if (!secret) {
      this.logger.warn('META_APP_SECRET empty — skipping signature check (dev)');
      return true;
    }
    if (!signatureHeader?.startsWith('sha256=')) {
      return false;
    }
    const expected = signatureHeader.slice('sha256='.length);
    const body =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    try {
      return timingSafeEqual(
        Buffer.from(digest, 'utf8'),
        Buffer.from(expected, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  extractExternalId(payload: Record<string, unknown>): string | null {
    if (typeof payload.entry === 'object' && Array.isArray(payload.entry)) {
      const entry = payload.entry[0] as Record<string, unknown> | undefined;
      if (entry && typeof entry.id === 'string') {
        const time = typeof entry.time === 'number' ? String(entry.time) : '';
        return time ? `${entry.id}:${time}` : entry.id;
      }
    }
    if (typeof payload.id === 'string') {
      return payload.id;
    }
    return null;
  }

  async recordAndQueue(
    channel: MetaChannel,
    payload: Record<string, unknown>,
    rawBody: Buffer | string,
    signatureHeader?: string,
  ) {
    if (!this.validateSignature(rawBody, signatureHeader)) {
      throw new UnauthorizedException('Invalid Meta signature');
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid webhook payload');
    }

    const provider = CHANNEL_TO_PROVIDER[channel];
    const payloadHash = hashPayload(payload);
    const externalEventId = resolveWebhookExternalId(
      this.extractExternalId(payload),
      payloadHash,
    );
    const key = buildWebhookIdempotencyKey(provider, externalEventId);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: key.provider as Provider,
          externalEventId: key.externalId,
        },
      },
    });

    if (isDuplicateWebhookEvent(existing)) {
      return {
        ok: true,
        duplicate: true,
        id: existing.id,
        queued: false,
      };
    }

    const byHash = await this.prisma.webhookEvent.findFirst({
      where: { provider, payloadHash },
    });
    if (isDuplicateWebhookEvent(byHash)) {
      return { ok: true, duplicate: true, id: byHash.id, queued: false };
    }

    let event: { id: string };
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          provider,
          externalEventId: key.externalId,
          eventType: `meta.${channel}`,
          payloadHash,
          payload: payload as Prisma.InputJsonValue,
          processingStatus: ProcessingStatus.PENDING,
        },
      });
    } catch {
      const again = await this.prisma.webhookEvent.findUnique({
        where: {
          provider_externalEventId: {
            provider,
            externalEventId: key.externalId,
          },
        },
      });
      if (again) {
        return { ok: true, duplicate: true, id: again.id, queued: false };
      }
      throw new BadRequestException('Failed to persist webhook event');
    }

    // Phase 3 stub: mark as queued for worker processing
    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: ProcessingStatus.PROCESSING },
    });

    this.logger.log(
      `Queued Meta ${channel} webhook event ${event.id} (${key.externalId})`,
    );

    return { ok: true, duplicate: false, id: event.id, queued: true };
  }
}
