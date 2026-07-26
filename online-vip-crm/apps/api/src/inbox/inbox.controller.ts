import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../permissions/permissions.constants';
import type { AuthUser } from '../common/types/auth-user';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.INBOX_VIEW)
  listConversations(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('channel') channel?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.inboxService.listConversations(user, req.institutionId, {
      channel,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
