import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, PERMISSIONS } from '@online-vip-crm/shared';

@Injectable()
export class PermissionsService {
  listCatalog() {
    return PERMISSION_CATALOG;
  }

  listKeys() {
    return PERMISSIONS;
  }
}
