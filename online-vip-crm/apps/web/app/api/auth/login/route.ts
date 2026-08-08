import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getApiUrl } from '@/lib/constants';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Geçersiz istek gövdesi' },
      { status: 400 },
    );
  }

  const apiUrl = getApiUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { message: 'API sunucusuna bağlanılamadı' },
      { status: 502 },
    );
  }

  const data = (await upstream.json().catch(() => null)) as
    | { accessToken?: string; message?: string | string[] }
    | null;

  if (!upstream.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || 'Giriş başarısız';
    return NextResponse.json({ message }, { status: upstream.status });
  }

  const token = data?.accessToken;
  if (!token) {
    return NextResponse.json(
      { message: 'Sunucudan token alınamadı' },
      { status: 502 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  const { accessToken: _omit, ...safe } = (data || {}) as {
    accessToken?: string;
  } & Record<string, unknown>;
  void _omit;

  return NextResponse.json(safe);
}
