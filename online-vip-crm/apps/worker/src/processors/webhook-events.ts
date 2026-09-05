import { ProcessingStatus, type PrismaClient } from '@online-vip-crm/database';
import type { Job } from 'bullmq';
import type { WebhookEventJobData } from '../types';

/**
 * Mock webhook processor: validates tenant scope, logs, marks event PROCESSED.
 */
export async function processWebhookEvent(
  prisma: PrismaClient,
  job: Job<WebhookEventJobData>,
): Promise<{ webhookEventId: string; status: string }> {
  const { webhookEventId, institutionId } = job.data;

  if (!webhookEventId) {
    throw new Error('webhook-events job missing webhookEventId');
  }

  const event = await prisma.webhookEvent.findFirst({
    where: {
      id: webhookEventId,
      ...(institutionId ? { institutionId } : {}),
    },
  });

  if (!event) {
    throw new Error(
      `WebhookEvent ${webhookEventId} not found` +
        (institutionId ? ` for institution ${institutionId}` : ''),
    );
  }

  if (institutionId && event.institutionId && event.institutionId !== institutionId) {
    throw new Error(
      `Tenant mismatch: job institution ${institutionId} != event ${event.institutionId}`,
    );
  }

  console.info(
    `[webhook-events] processing id=${event.id} provider=${event.provider} institution=${event.institutionId ?? 'null'} attempt=${job.attemptsMade + 1}`,
  );

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      processingStatus: ProcessingStatus.PROCESSING,
      attemptCount: { increment: 1 },
    },
  });

  // Mock work — real channel handlers will replace this in later phases.
  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      processingStatus: ProcessingStatus.PROCESSED,
      processedAt: new Date(),
      lastError: null,
    },
  });

  console.info(`[webhook-events] processed id=${event.id}`);
  return { webhookEventId: event.id, status: ProcessingStatus.PROCESSED };
}
