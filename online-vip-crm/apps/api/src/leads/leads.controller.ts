import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../permissions/permissions.constants';
import type { AuthUser } from '../common/types/auth-user';
import { LeadsService } from './leads.service';
import { UpdateLeadStageDto } from './dto/lead.dto';

@Controller('leads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('stageId') stageId?: string,
    @Query('stageKey') stageKey?: string,
    @Query('stage') stage?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.leadsService.list(user, req.institutionId, {
      stageId,
      stageKey: stageKey ?? stage,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Patch(':id/stage')
  @RequirePermissions(PERMISSIONS.LEAD_UPDATE)
  updateStage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
  ) {
    return this.leadsService.updateStage(user, req.institutionId, id, dto);
  }
}
