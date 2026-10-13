import { NextRequest, type NextResponse } from 'next/server';

// يستدعي مسار app/api/mobile/v1 مباشرة كما يستدعيه Next.js — بلا خادم HTTP.

type Handler = (req: NextRequest, ctx: { params: Promise<never> }) => Promise<NextResponse>;

export type ApiCall = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** true ⇒ Authorization: Bearer — الهوية من actAs() */
  auth?: boolean;
};

export type ApiResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
  message: string | undefined;
  error: { code: string; message_ar: string; field_errors?: Record<string, string[]> } | undefined;
};

export async function call<T = unknown>(handler: Handler, opts: ApiCall = {}): Promise<ApiResponse<T>> {
  const url = new URL('http://test.local/api/mobile/v1/x');
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.auth !== false) headers.set('authorization', 'Bearer test-token');
  const req = new NextRequest(url, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as never) });
  const json = (await res.json()) as { data?: T; message_ar?: string; error?: ApiResponse['error'] };
  return { status: res.status, headers: res.headers, data: json.data as T, message: json.message_ar, error: json.error };
}
