import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACT_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.contactsService.list(user, req.institutionId, {
      q,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTACT_CREATE)
  create(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.create(user, req.institutionId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTACT_UPDATE)
  update(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(user, req.institutionId, id, dto);
  }
}
