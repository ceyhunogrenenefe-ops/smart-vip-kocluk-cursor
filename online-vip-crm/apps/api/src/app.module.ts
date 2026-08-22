import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ContactsModule } from './contacts/contacts.module';
import { LeadsModule } from './leads/leads.module';
import { TasksModule } from './tasks/tasks.module';
import { InboxModule } from './inbox/inbox.module';
import { MetaWebhooksModule } from './webhooks/meta/meta-webhooks.module';
import { PublicFormsModule } from './public/forms/public-forms.module';
import { MockModule } from './mock/mock.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),
    CommonModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    PermissionsModule,
    HealthModule,
    DashboardModule,
    ContactsModule,
    LeadsModule,
    TasksModule,
    InboxModule,
    MetaWebhooksModule,
    PublicFormsModule,
    MockModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
