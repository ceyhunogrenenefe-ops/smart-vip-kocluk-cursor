import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Module({
  controllers: [PublicFormsController],
  providers: [PublicFormsService, ApiKeyGuard],
})
export class PublicFormsModule {}
