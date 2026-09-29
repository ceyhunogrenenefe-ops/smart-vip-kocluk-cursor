export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  role: string;
  roles: string[];
  institutionId: string | null;
  permissions: string[];
  isActive: boolean;
  isPlatformAdmin: boolean;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  institutionId: string | null;
  permissions: string[];
};

export const PLATFORM_SUPER_ADMIN = 'PLATFORM_SUPER_ADMIN';

declare module 'express' {
  interface Request {
    user?: AuthUser;
    institutionId?: string | null;
    rawBody?: Buffer;
  }
}
