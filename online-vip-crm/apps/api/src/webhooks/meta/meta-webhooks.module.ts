import { Module } from '@nestjs/common';
import { MetaWebhooksController } from './meta-webhooks.controller';
import { MetaWebhooksService } from './meta-webhooks.service';

@Module({
  controllers: [MetaWebhooksController],
  providers: [MetaWebhooksService],
})
export class MetaWebhooksModule {}
