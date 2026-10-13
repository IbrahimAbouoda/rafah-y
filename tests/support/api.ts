import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NextRequest, type NextResponse } from 'next/server';

// يستدعي مسار app/api/mobile/v1 مباشرة كما يستدعيه Next.js — بلا خادم HTTP.
// `npm run api:fixtures` يسجّل أغنى استجابة ناجحة لكل مسار في docs/mobile/fixtures/ — مصدر أمثلة OpenAPI
// واختبارات العقد في تطبيق Flutter.

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

const RECORD = process.env.npm_lifecycle_event === 'api:fixtures';
const FIXTURES = path.resolve(import.meta.dirname, '../../docs/mobile/fixtures');

/** ملفات route.ts كلها بمساراتها — مشتركة مع اختبار المرور على كل المسارات */
export async function mobileRoutes(): Promise<{ path: string; module: Record<string, unknown> }[]> {
  const root = path.resolve(import.meta.dirname, '../../app/api/mobile/v1');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('route.ts')).sort();
  return Promise.all(
    files.map(async (f) => {
      const rel = path.dirname(f).split(path.sep).join('/');
      const p = `/${rel === '.' ? '' : rel}`.replace(/\[(\w+)\]/g, '{$1}');
      return { path: p, module: (await import(pathToFileURL(path.join(root, f)).href)) as Record<string, unknown> };
    }),
  );
}

/** كل معالج ← مساره وطريقته */
let routes: Map<unknown, { method: string; path: string }> | null = null;
async function routeOf(handler: Handler) {
  if (!routes) {
    routes = new Map();
    for (const { path: p, module } of await mobileRoutes()) {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) if (module[method]) routes.set(module[method], { method, path: p });
    }
  }
  return routes.get(handler);
}

/** أغنى استجابة ناجحة لكل مسار خلال التشغيل (السكربت يمسح المجلد قبله) — قائمة فارغة لا تصلح مثالًا لشكل عناصرها */
async function record(handler: Handler, status: number, json: unknown) {
  const route = await routeOf(handler);
  if (!route || status >= 300) return;
  const name = `${route.method} ${route.path}`;
  mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, `${route.method.toLowerCase()}${route.path.replace(/[/{}]+/g, '_').replace(/_+$/, '')}.json`);
  const text = `${stable(JSON.stringify({ route: name, status, body: json }, null, 2))}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8').length >= text.length) return;
  writeFileSync(file, text);
}


/** قيم تتغيّر في كل تشغيل ← قيم ثابتة بالشكل نفسه، فلا تتبدّل الأمثلة في git بلا تغيّر في العقد */
function stable(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '00000000-0000-4000-8000-000000000000')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '2026-01-01T09:00:00.000Z')
    .replace(/RF-([A-Z]+)-(\d{4})-\d+/g, (_m, kind: string, year: string) => `RF-${kind}-${year}-${kind === 'DEC' ? '0001' : '000001'}`)
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, (m) => (/\d/.test(m) || /^[A-Z]{4}-[A-Z]{4}$/.test(m) ? 'K7QM-3XWD' : m))
    .replace(/(test|mobile)-[0-9a-f]{8}@example\.test/g, '$1-00000000@example.test')
    .replace(/ [0-9a-f]{8}(?=["\s])/g, ' 0000')
    .replace(/ \d{13}(?=")/g, ' 0')
    .replace(/"(access|refresh)-[^"]+"/g, '"$1-token"');
}

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
  if (RECORD) await record(handler, res.status, json);
  return { status: res.status, headers: res.headers, data: json.data as T, message: json.message_ar, error: json.error };
}
