import type {
  Contact,
  Conversation,
  DashboardSummary,
  Lead,
  Paginated,
  Task,
} from './types';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Client-side fetch against same-origin BFF proxy (cookie attached automatically). */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const normalized = path.replace(/^\//, '');
  const res = await fetch(`/api/proxy/${normalized}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
  });

  const body = await parseJson(res);
  if (!res.ok) {
    const message =
      typeof body === 'object' &&
      body &&
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
        ? (body as { message: string }).message
        : Array.isArray(
              typeof body === 'object' &&
                body &&
                'message' in body &&
                (body as { message: unknown }).message,
            )
          ? ((body as { message: string[] }).message || []).join(', ')
          : `İstek başarısız (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export const api = {
  dashboardSummary: () => apiFetch<DashboardSummary>('dashboard/summary'),
  conversations: (params?: { channel?: string; take?: number }) => {
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.take) q.set('take', String(params.take));
    const qs = q.toString();
    return apiFetch<Paginated<Conversation>>(
      `inbox/conversations${qs ? `?${qs}` : ''}`,
    );
  },
  contacts: (params?: { q?: string; take?: number }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set('q', params.q);
    if (params?.take) q.set('take', String(params.take));
    const qs = q.toString();
    return apiFetch<Paginated<Contact>>(`contacts${qs ? `?${qs}` : ''}`);
  },
  leads: (params?: { take?: number; stageKey?: string }) => {
    const q = new URLSearchParams();
    if (params?.take) q.set('take', String(params.take));
    if (params?.stageKey) q.set('stageKey', params.stageKey);
    const qs = q.toString();
    return apiFetch<Paginated<Lead>>(`leads${qs ? `?${qs}` : ''}`);
  },
  tasks: (params?: { status?: string; overdue?: boolean; take?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.overdue) q.set('overdue', 'true');
    if (params?.take) q.set('take', String(params.take));
    const qs = q.toString();
    return apiFetch<Paginated<Task>>(`tasks${qs ? `?${qs}` : ''}`);
  },
  me: () =>
    apiFetch<{
      user: {
        id: string;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
      };
      institution: { id: string; name: string } | null;
      permissions: string[];
    }>('auth/me'),
};
