import { Injectable } from '@nestjs/common';
import { resolvePermissionCatalog } from './permissions.constants';

@Injectable()
export class PermissionsService {
  listCatalog() {
    return resolvePermissionCatalog();
  }
}
