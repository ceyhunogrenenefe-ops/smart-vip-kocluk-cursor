import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../permissions/permissions.constants';
import type { AuthUser } from '../common/types/auth-user';
import { InboxService } from './inbox.service';

class ReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

class AssignDto {
  @IsUUID()
  userId!: string;
}

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
    @Query('assignedToMe') assignedToMe?: string,
    @Query('unassigned') unassigned?: string,
    @Query('unread') unread?: string,
    @Query('status') status?: string,
  ) {
    return this.inboxService.listConversations(user, req.institutionId, {
      channel,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
      assignedToMe: assignedToMe === '1' || assignedToMe === 'true',
      unassigned: unassigned === '1' || unassigned === 'true',
      unread: unread === '1' || unread === 'true',
      status,
    });
  }

  @Get('conversations/:id')
  @RequirePermissions(PERMISSIONS.INBOX_VIEW)
  getConversation(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inboxService.getConversation(user, req.institutionId, id);
  }

  @Get('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.INBOX_VIEW)
  listMessages(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.inboxService.listMessages(user, req.institutionId, id, {
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Post('conversations/:id/reply')
  @RequirePermissions(PERMISSIONS.INBOX_REPLY)
  reply(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.inboxService.reply(user, req.institutionId, id, dto.text);
  }

  @Post('conversations/:id/assign')
  @RequirePermissions(PERMISSIONS.CONVERSATION_ASSIGN)
  assign(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
  ) {
    return this.inboxService.assign(
      user,
      req.institutionId,
      id,
      dto.userId,
    );
  }
}
