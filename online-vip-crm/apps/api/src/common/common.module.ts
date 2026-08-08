import { Global, Module } from '@nestjs/common';
import { InstitutionContext } from './services/institution-context.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  providers: [InstitutionContext, JwtAuthGuard, PermissionsGuard],
  exports: [InstitutionContext, JwtAuthGuard, PermissionsGuard],
})
export class CommonModule {}
