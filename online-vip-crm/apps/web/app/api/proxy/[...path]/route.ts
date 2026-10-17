import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, getApiUrl } from '@/lib/constants';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: 'Oturum gerekli' }, { status: 401 });
  }

  const apiUrl = getApiUrl();
  const search = request.nextUrl.search;
  const target = `${apiUrl}/${path.join('/')}${search}`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  const institutionId = request.headers.get('x-institution-id');
  if (institutionId) headers.set('x-institution-id', institutionId);

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'API sunucusuna bağlanılamadı' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) responseHeaders.set('content-type', upstreamType);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
