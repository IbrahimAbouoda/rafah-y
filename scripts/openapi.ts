import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import * as auth from '../lib/validation/auth';
import * as complaints from '../lib/validation/complaints';
import * as ideas from '../lib/validation/ideas';
import * as initiatives from '../lib/validation/initiatives';
import * as settings from '../lib/validation/settings';
import * as tasks from '../lib/validation/tasks';

// يولّد docs/mobile/openapi.yaml من ثلاثة مصادر لا تُكتب باليد:
//   1) ملفات app/api/mobile/v1/**/route.ts — المسارات وطرقها ومستوى الهوية ووصفها (تعليق الملف)
//   2) مخططات Zod نفسها التي تتحقق بها الدالة المشتركة — جسم الطلب
//   3) docs/mobile/fixtures (npm run api:fixtures) — مثال الاستجابة ومخططها المستنتج
// npm run api:openapi يكتب الملف؛ واختبار وحدة يفشل إن تأخر الملف عن المصادر.

const ROOT = path.resolve(import.meta.dirname, '..');
const API = path.join(ROOT, 'app/api/mobile/v1');
const FIXTURES = path.join(ROOT, 'docs/mobile/fixtures');
export const SPEC_FILE = path.join(ROOT, 'docs/mobile/openapi.yaml');

/** دالة lib/** التي يستدعيها المسار ← المخطط الذي تتحقق به مدخلاتها */
const FN_SCHEMAS: Record<string, z.ZodType> = {
  registerFlow: auth.RegisterSchema,
  loginFlow: auth.LoginSchema,
  resetRequestFlow: auth.ResetRequestSchema,
  submitPublicComplaint: complaints.SubmitComplaintSchema,
  submitAccountComplaint: complaints.SubmitComplaintSchema,
  trackComplaint: complaints.TrackSchema,
  createUploadUrl: complaints.CreateUploadSchema,
  confirmUpload: complaints.ConfirmUploadSchema,
  getDownloadUrl: complaints.FileIdSchema,
  openForTriage: complaints.ComplaintIdSchema,
  assignToCommittee: complaints.AssignComplaintSchema,
  updateStatus: complaints.UpdateStatusSchema,
  referComplaint: complaints.ReferComplaintSchema,
  closeComplaint: complaints.CloseComplaintSchema,
  dismissComplaint: complaints.DismissComplaintSchema,
  readContact: complaints.ComplaintIdSchema,
  markRead: complaints.NotificationIdSchema,
  submitIdea: ideas.SubmitIdeaSchema,
  reviseIdea: ideas.ReviseIdeaSchema,
  voteIdea: ideas.IdeaIdSchema,
  reviewIdea: ideas.ReviewIdeaSchema,
  mergeIdea: ideas.MergeIdeaSchema,
  decideIdea: ideas.DecideIdeaSchema,
  saveInitiative: initiatives.InitiativeSchema,
  setInitiativeStatus: initiatives.InitiativeStatusSchema,
  updateProgress: initiatives.InitiativeProgressSchema,
  upsertNeed: initiatives.NeedSchema,
  removeNeed: initiatives.NeedIdSchema,
  postUpdate: initiatives.PostUpdateSchema,
  submitOffer: initiatives.SubmitOfferSchema,
  decideOffer: initiatives.DecideOfferSchema,
  recordFunding: initiatives.RecordFundingSchema,
  approveFunding: initiatives.FundingIdSchema,
  saveOrganization: initiatives.OrganizationSchema,
  setOrganizationStage: initiatives.OrganizationStageSchema,
  logInteraction: initiatives.InteractionSchema,
  linkMember: initiatives.LinkMemberSchema,
  unlinkMember: initiatives.UnlinkMemberSchema,
  createPoll: initiatives.CreatePollSchema,
  setThreshold: initiatives.SetThresholdSchema,
  demandVote: initiatives.DemandVoteSchema,
  editConceptNote: initiatives.EditConceptNoteSchema,
  approveConceptNote: initiatives.ConceptNoteIdSchema,
  markConceptNoteSent: initiatives.ConceptNoteIdSchema,
  saveCommittee: settings.CommitteeSchema,
  saveCategory: settings.CategorySchema,
  saveArea: settings.AreaSchema,
  assignRole: settings.AssignRoleSchema,
  revokeRole: settings.RevokeRoleSchema,
  startTerm: settings.StartTermSchema,
  createTask: tasks.CreateTaskSchema,
  reassignTask: tasks.ReassignTaskSchema,
  moveTask: tasks.MoveTaskSchema,
  approveTask: tasks.TaskIdSchema,
  commentTask: tasks.CommentTaskSchema,
};

/** دوال بلا جسم طلب */
const NO_BODY = new Set(['markAllRead']);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Schema = { [k: string]: Json };

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

type Handler = { method: string; auth: 'required' | 'optional' | 'none'; fn: string | null; merged: string[]; query: string[] };

function parseRoute(text: string): { comment: string; handlers: Handler[] } {
  const comment = (text.match(/^\/\/ (.+)$/m)?.[1] ?? '').trim();
  const parts = text.split(/(?=^export const (?:GET|POST|PATCH|DELETE) = )/m).slice(1);
  const handlers = parts.map((part) => {
    const method = part.match(/^export const (\w+)/)![1]!;
    const authLevel = part.match(/auth: '(required|optional|none)'/)![1] as Handler['auth'];
    const fn = [...part.matchAll(/\b(\w+)\(/g)].map((m) => m[1]!).find((name) => name in FN_SCHEMAS || NO_BODY.has(name)) ?? null;
    const merged = [...(part.match(/merge\(body, \{([^}]*)\}\)/)?.[1] ?? '').matchAll(/(\w+):/g)].map((m) => m[1]!);
    const query = [...part.matchAll(/query\.get\('(\w+)'\)/g)].map((m) => m[1]!);
    if (/pageOf\(query/.test(part)) query.push('page', 'pageSize');
    return { method, auth: authLevel, fn, merged, query: [...new Set(query)] };
  });
  return { comment, handlers };
}

/** مخطط JSON من مثال — للاستجابات. الأنواع من القيمة، والحقول كلها مطلوبة لأن الخادم يرسلها دائمًا. */
function infer(value: unknown): Schema {
  if (value === null) return { nullable: true };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? infer(value[0]) : {} };
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: 'object',
      properties: Object.fromEntries(entries.map(([k, v]) => [k, infer(v)])),
      required: entries.map(([k]) => k),
    };
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return { type: 'string', format: 'date-time' };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) return { type: 'string', format: 'uuid' };
    return { type: 'string' };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: 'boolean' };
}

/** مخطط الطلب من Zod بصيغة الإدخال، بلا ما يأتي من المسار */
function requestSchema(schema: z.ZodType, omit: string[]): Schema {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', target: 'openapi-3.0' }) as Schema;
  delete json.$schema;
  const props = json.properties as Record<string, Json> | undefined;
  if (props) for (const k of omit) delete props[k];
  if (Array.isArray(json.required)) {
    json.required = (json.required as string[]).filter((k) => !omit.includes(k));
    if ((json.required as string[]).length === 0) delete json.required;
  }
  return json;
}

function fixture(method: string, route: string): unknown {
  const file = path.join(FIXTURES, `${method.toLowerCase()}${route.replace(/[/{}]+/g, '_').replace(/_+$/, '')}.json`);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, 'utf8')) as { body: unknown }).body;
}

const ERROR_RESPONSES: Record<string, string> = {
  '401': 'بلا رمز صالح — UNAUTHENTICATED',
  '403': 'لا تملك الصلاحية — FORBIDDEN',
  '404': 'غير موجود أو خارج نطاقك — NOT_FOUND',
  '409': 'تعارض مع تغيير آخر — CONFLICT',
  '422': 'مدخلات أو انتقال غير صالح، مع field_errors — INVALID',
  '429': 'حد المعدل، مع رأس Retry-After — RATE_LIMITED',
};

export function buildSpec(): Schema {
  const paths: Record<string, Schema> = {};
  const missing: string[] = [];
  for (const file of routeFiles(API).sort()) {
    const route = path.relative(API, path.dirname(file)).split(path.sep).join('/').replace(/\[(\w+)\]/g, '{$1}');
    const p = `/${route}`;
    const { comment, handlers } = parseRoute(readFileSync(file, 'utf8'));
    const tag = route.split('/')[0] === 'admin' || route.split('/')[0] === 'public' ? route.split('/').slice(0, 2).join('/') : route.split('/')[0]!;
    const pathParams = [...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1]!, in: 'path', required: true, schema: { type: 'string' } }));
    const ops: Schema = {};
    for (const h of handlers) {
      const example = fixture(h.method, p);
      if (example === undefined) missing.push(`${h.method} ${p}`);
      const status = h.method === 'POST' && example && typeof example === 'object' ? '2XX' : '200';
      const op: Schema = {
        tags: [tag],
        summary: comment,
        operationId: `${h.method.toLowerCase()}${p.replace(/\{(\w+)\}/g, 'By_$1').replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
        ...(h.auth === 'none' ? { security: [] } : h.auth === 'optional' ? { security: [{}, { bearer: [] }] } : {}),
        parameters: [
          ...pathParams,
          ...h.query.map((name) => ({
            name,
            in: 'query',
            required: false,
            schema: name === 'page' || name === 'pageSize' ? { type: 'integer', minimum: 1 } : { type: 'string' },
          })),
        ],
        responses: {
          [status]: {
            description: 'نجاح — { data, message_ar? }',
            content: {
              'application/json': {
                schema: example === undefined ? { $ref: '#/components/schemas/Success' } : infer(example),
                ...(example === undefined ? {} : { example: example as Json }),
              },
            },
          },
          ...Object.fromEntries(
            Object.entries(ERROR_RESPONSES)
              .filter(([code]) => h.auth === 'required' || code !== '401')
              .map(([code, description]) => [code, { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }]),
          ),
        },
      };
      if ((op.parameters as Json[]).length === 0) delete op.parameters;
      const schema = h.fn ? FN_SCHEMAS[h.fn] : undefined;
      if (schema && h.method !== 'GET') {
        const body = requestSchema(schema, h.merged);
        // كل الحقول من المسار ⇒ الجسم اختياري ({})
        const empty = !body.properties || Object.keys(body.properties as object).length === 0;
        op.requestBody = { required: !empty, content: { 'application/json': { schema: body } } };
      }
      ops[h.method.toLowerCase()] = op;
    }
    paths[p] = ops;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Rafah Pulse — Mobile API',
      version: '1.0.0',
      description: [
        'واجهة تطبيق الجوّال (Flutter) — العميل الثاني للخادم وقاعدة البيانات نفسيهما (D44).',
        'كل مسار يمرّ بقالب Server Action نفسه: الهوية ← الصلاحية ← Zod ← الدالة المشتركة في lib/** داخل معاملة مع سطر التدقيق.',
        'الهوية: Authorization: Bearer <رمز وصول Supabase>. الأخطاء: { error: { code, message_ar, field_errors? } } بالرسالة العربية نفسها التي يعرضها الويب.',
        'الأرقام المرجعية ورموز التتبّع يولّدها الخادم وحده. المبالغ نصوص عشرية. بيانات التواصل لا تُخزَّن على الجهاز.',
        `مسارات بلا مثال استجابة مسجَّل: ${missing.length}`,
      ].join('\n'),
    },
    servers: [{ url: '/api/mobile/v1' }],
    security: [{ bearer: [] }],
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'رمز وصول Supabase Auth' } },
      schemas: {
        Success: { type: 'object', properties: { data: {}, message_ar: { type: 'string' } }, required: ['data'] },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message_ar'],
              properties: {
                code: { type: 'string', enum: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INVALID', 'RATE_LIMITED', 'SERVER'] },
                message_ar: { type: 'string' },
                field_errors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  };
}

// ─── YAML: مجموعة JSON الفرعية بأسلوب الكتل — بلا اعتمادية ───────────────────
const plain = /^[A-Za-z_][A-Za-z0-9_./-]*$/;
const reserved = /^(true|false|null|yes|no|on|off|~)$/i;
const scalar = (v: Json): string =>
  v === null ? 'null' : typeof v === 'string' ? (plain.test(v) && !reserved.test(v) ? v : JSON.stringify(v)) : String(v);
const key = (k: string) => (plain.test(k) && !reserved.test(k) ? k : JSON.stringify(k));

export function toYaml(value: Json, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object' && Object.keys(item).length > 0) {
          const body = toYaml(item, indent + 2);
          return `${pad}- ${body.trimStart()}`;
        }
        return `${pad}- ${item !== null && typeof item === 'object' ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) {
          return `${pad}${key(k)}:\n${toYaml(v, indent + 2)}`;
        }
        return `${pad}${key(k)}: ${v !== null && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
      })
      .join('\n');
  }
  return scalar(value);
}

export function renderSpec(): string {
  return `# مولَّد — لا تعدّله باليد: npm run api:openapi (scripts/openapi.ts)\n${toYaml(buildSpec() as Json)}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(SPEC_FILE, renderSpec());
  const spec = buildSpec() as { paths: Record<string, object>; info: { description: string } };
  process.stdout.write(`openapi.yaml: ${Object.keys(spec.paths).length} paths\n${spec.info.description.split('\n').at(-1)}\n`);
}
