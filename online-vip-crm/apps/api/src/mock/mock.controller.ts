import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../permissions/permissions.constants';
import type { AuthUser } from '../common/types/auth-user';
import { MockService } from './mock.service';
import { MockMessageDto } from './dto/mock-message.dto';

@Controller('mock')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MockController {
  constructor(private readonly mockService: MockService) {}

  @Post('messages')
  @RequirePermissions(PERMISSIONS.INBOX_VIEW)
  createMessage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() dto: MockMessageDto,
  ) {
    return this.mockService.createInboundMessage(user, req.institutionId, dto);
  }
}
