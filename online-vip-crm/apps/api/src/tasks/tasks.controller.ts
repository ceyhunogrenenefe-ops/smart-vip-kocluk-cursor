import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../permissions/permissions.constants';
import type { AuthUser } from '../common/types/auth-user';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TASK_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('overdue') overdue?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.tasksService.list(user, req.institutionId, {
      status,
      assigneeId,
      overdue: overdue === 'true' || overdue === '1',
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
