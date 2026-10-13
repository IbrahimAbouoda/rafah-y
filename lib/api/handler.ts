import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { toErrorInfo, type ErrorCode } from '@/lib/action';
import { userFromRequest } from '@/lib/api/auth';
import { invalid, unauthenticated } from '@/lib/errors';
import type { SessionUser } from '@/lib/rbac';

// غلاف كل مسار في app/api/mobile/v1 — قالب CLAUDE.md نفسه: الهوية هنا، والصلاحية والتحقق والمعاملة
// والتدقيق في دالة lib/** المشتركة مع Server Action. الأخطاء بالرسالة العربية نفسها التي يراها الويب.

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID: 422,
  RATE_LIMITED: 429,
  SERVER: 500,
};

export type ApiErrorBody = {
  error: { code: ErrorCode; message_ar: string; field_errors?: Record<string, string[] | undefined> };
};

/** نتيجة ناجحة: البيانات، ورسالة عربية اختيارية تعرضها الواجهة كما هي. */
export type ApiResult = { data?: unknown; message?: string; status?: number };

type Base<P> = { req: NextRequest; params: P; query: URLSearchParams; body: unknown };
type AuthedCtx<P> = Base<P> & { user: SessionUser };
type OptionalCtx<P> = Base<P> & { user: SessionUser | null };

type RouteContext<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse>;

/** Decimal.toJSON يعطي نصًّا؛ BigInt (معرّف AuditLog) لا يُسلسَل افتراضيًا */
function json(value: unknown, init: ResponseInit): NextResponse {
  const body = JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  // استجابات الواجهة تخص صاحب الرمز وحده — لا تخزين في وسيط ولا في ذاكرة الجهاز المؤقتة للـ HTTP
  headers.set('cache-control', 'no-store');
  return new NextResponse(body, { ...init, headers });
}

export function errorResponse(e: unknown): NextResponse {
  const info = toErrorInfo(e);
  const headers: HeadersInit = info.retryAfterSec ? { 'retry-after': String(info.retryAfterSec) } : {};
  const body: ApiErrorBody = {
    error: { code: info.code, message_ar: info.message, ...(info.fieldErrors ? { field_errors: info.fieldErrors } : {}) },
  };
  return json(body, { status: STATUS[info.code], headers });
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return undefined;
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalid('تعذّرت قراءة الطلب: الجسم ليس JSON صالحًا.');
  }
}

export function apiRoute<P = Record<string, never>>(
  opts: { auth: 'required' },
  fn: (ctx: AuthedCtx<P>) => Promise<ApiResult>,
): Handler<P>;
export function apiRoute<P = Record<string, never>>(
  opts: { auth: 'optional' | 'none' },
  fn: (ctx: OptionalCtx<P>) => Promise<ApiResult>,
): Handler<P>;
export function apiRoute<P>(
  opts: { auth: 'required' | 'optional' | 'none' },
  fn: (ctx: AuthedCtx<P>) => Promise<ApiResult>,
): Handler<P> {
  return async (req, routeCtx) => {
    try {
      // 1) الهوية — قبل لمس المدخلات
      const user = opts.auth === 'none' ? null : await userFromRequest(req);
      if (opts.auth === 'required' && !user) throw unauthenticated();
      const params = ((await routeCtx?.params) ?? {}) as P;
      const body = await readBody(req);
      const result = await fn({ req, user: user as SessionUser, params, body, query: req.nextUrl.searchParams });
      return json(
        { data: result.data ?? null, ...(result.message ? { message_ar: result.message } : {}) },
        { status: result.status ?? 200 },
      );
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** ترقيم بالمؤشر: ?cursor=&limit= (افتراضي 20، أقصى 50) */
export function pageParams(query: URLSearchParams, max = 50): { cursor: string | null; take: number } {
  const n = Number(query.get('limit'));
  const take = Number.isInteger(n) && n > 0 ? Math.min(n, max) : 20;
  return { cursor: query.get('cursor') || null, take };
}

/** يقصّ صفًّا زائدًا جُلب لمعرفة وجود صفحة تالية */
export function paginate<T extends { id: string }>(rows: T[], take: number): { items: T[]; next_cursor: string | null } {
  const items = rows.slice(0, take);
  return { items, next_cursor: rows.length > take ? items[items.length - 1]!.id : null };
}
