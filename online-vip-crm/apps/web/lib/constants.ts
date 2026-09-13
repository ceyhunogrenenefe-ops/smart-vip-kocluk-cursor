export const AUTH_COOKIE = 'ovcrm_token';

export function getApiUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000'
  );
}

export function getPublicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
}

export const PUBLIC_PATHS = ['/login', '/forgot-password'] as const;
