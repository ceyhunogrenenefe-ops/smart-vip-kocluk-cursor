import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';
import { PublicFormsService } from './public-forms.service';
import { PublicLeadFormDto } from './dto/public-lead.dto';

@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly publicForms: PublicFormsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('leads')
  createLead(@Req() req: Request, @Body() dto: PublicLeadFormDto) {
    const institutionId = req.institutionId;
    if (!institutionId) {
      throw new Error('Institution resolved by API key is missing');
    }
    return this.publicForms.createLead(institutionId, dto);
  }
}
