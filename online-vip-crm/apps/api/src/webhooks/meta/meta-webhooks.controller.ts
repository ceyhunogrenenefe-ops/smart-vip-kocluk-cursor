import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MetaWebhooksService, type MetaChannel } from './meta-webhooks.service';

const CHANNELS = new Set<MetaChannel>(['whatsapp', 'instagram', 'messenger']);

@Controller('webhooks/meta')
export class MetaWebhooksController {
  constructor(private readonly metaWebhooks: MetaWebhooksService) {}

  @Public()
  @Get(':channel')
  verify(
    @Param('channel') channel: string,
    @Res() res: Response,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    this.assertChannel(channel);
    const result = this.metaWebhooks.verifySubscription({
      mode,
      verifyToken,
      challenge,
    });
    res.status(200).send(result);
  }

  @Public()
  @Post(':channel')
  async receive(
    @Param('channel') channel: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const ch = this.assertChannel(channel);
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.metaWebhooks.recordAndQueue(ch, body, rawBody, signature);
  }

  private assertChannel(channel: string): MetaChannel {
    const normalized = channel.toLowerCase() as MetaChannel;
    if (!CHANNELS.has(normalized)) {
      throw new BadRequestException(`Unsupported Meta channel: ${channel}`);
    }
    return normalized;
  }
}
