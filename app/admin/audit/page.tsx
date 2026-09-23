import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { guardPage } from '@/lib/page-guard';
import { formatDateTime, gazaDayStart } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form-controls';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'سجل التدقيق' };

const PAGE_SIZE = 30;

// AC-19 — الجدول إلحاقي فقط بـ trigger؛ هذه الشاشة قراءة وتصفية لا أكثر.
// أسماء الأفعال للعرض، مطابقة لقائمة §6.9 (والفعل غير المعروف يُعرض بمفتاحه).
const ACTIONS: Record<string, string> = {
  'complaint.create': 'تقديم شكوى',
  'complaint.triage': 'فتح شكوى للفرز',
  'complaint.assign': 'تحويل شكوى للجنة',
  'complaint.status_change': 'تغيير حالة شكوى',
  'complaint.refer': 'إحالة شكوى لجهة خارجية',
  'complaint.close': 'إغلاق/استبعاد شكوى',
  'complaint.contact_read': 'قراءة بيانات تواصل',
  'file.download': 'تنزيل مرفق',
  'role.assign': 'تعيين دور',
  'role.revoke': 'سحب دور',
  'term.change': 'تغيير دورة المجلس',
  'settings.change': 'تعديل إعدادات',
};

type Search = { action?: string; actor?: string; from?: string; to?: string; entity?: string; page?: string };

function hrefWith(params: Search, patch: Partial<Search>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v));
  const qs = next.toString();
  return `/admin/audit${qs ? `?${qs}` : ''}`;
}

function parseDay(value: string | undefined, endOfDay: boolean): Date | null {
  const start = value ? gazaDayStart(value) : null;
  if (!start) return null;
  return endOfDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) : start;
}

const pretty = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  // AC-19 ④: لا يظهر السجل لمن لا يملك audit:read
  const { allowed, backHref } = await guardPage('/admin/audit', 'audit:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;

  const page = Math.max(1, Number(params.page) || 1);
  const filters: Prisma.AuditLogWhereInput[] = [];
  if (params.action) filters.push({ action: params.action });
  const actor = params.actor?.trim();
  if (actor) {
    filters.push({
      actor: { OR: [{ fullName: { contains: actor, mode: 'insensitive' } }, { email: { contains: actor, mode: 'insensitive' } }] },
    });
  }
  const entity = params.entity?.trim();
  if (entity) filters.push({ entityId: entity });
  const from = parseDay(params.from, false);
  const to = parseDay(params.to, true);
  if (from || to) filters.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const where: Prisma.AuditLogWhereInput = filters.length ? { AND: filters } : {};

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorRoles: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);
  const filtered = filters.length > 0;

  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        description="من فعل ماذا ومتى. السجل إلحاقي: لا يُعدَّل سطر ولا يُحذف، والأدوار المعروضة هي أدوار المنفّذ لحظة الفعل."
      />
      <Card className="mb-4 p-3">
        <form action="/admin/audit" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_auto_auto_auto] lg:items-end" role="search">
          <div className="flex flex-col gap-1">
            <Label htmlFor="action">العملية</Label>
            <Select id="action" name="action" defaultValue={params.action ?? ''}>
              <option value="">كل العمليات</option>
              {Object.entries(ACTIONS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="actor">المنفّذ</Label>
            <Input id="actor" name="actor" defaultValue={actor ?? ''} placeholder="الاسم أو البريد" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">من</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">إلى</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
          </div>
          <div className="flex gap-2">
            {entity ? <input type="hidden" name="entity" value={entity} /> : null}
            <Button type="submit">تصفية</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/admin/audit">مسح</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id.toString()}
        empty={
          filtered
            ? { title: 'لا سطور لهذه التصفية', hint: 'وسّع نطاق التاريخ أو اختر عملية أخرى، أو امسح التصفية.' }
            : { title: 'السجل فارغ', hint: 'كل عملية حساسة — تعيين دور، تحويل شكوى، قراءة بيانات تواصل — تظهر هنا فور تنفيذها.' }
        }
        pagination={{ page, pageSize: PAGE_SIZE, total, hrefFor: (p) => hrefWith(params, { page: String(p) }) }}
        columns={[
          {
            key: 'when',
            header: 'الوقت',
            className: 'whitespace-nowrap',
            cell: (r) => <time dateTime={r.createdAt.toISOString()}>{formatDateTime(r.createdAt)}</time>,
          },
          {
            key: 'actor',
            header: 'المنفّذ',
            cell: (r) => (
              <span className="flex flex-col">
                <span>{r.actor?.fullName ?? 'النظام'}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {r.actorRoles.join(', ')}
                </span>
              </span>
            ),
          },
          {
            key: 'action',
            header: 'العملية',
            cell: (r) => (
              <details className="max-w-xl">
                <summary className="cursor-pointer">
                  {ACTIONS[r.action] ?? r.action}{' '}
                  <span className="text-xs text-muted-foreground">
                    · {r.entityType}{' '}
                    <Link href={hrefWith({}, { entity: r.entityId })} className="font-mono hover:underline" dir="ltr">
                      {r.entityId.slice(0, 8)}
                    </Link>
                  </span>
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">قبل</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs" dir="ltr">
                      {pretty(r.before)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">بعد</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs" dir="ltr">
                      {pretty(r.after)}
                    </pre>
                  </div>
                </div>
              </details>
            ),
          },
        ]}
      />
    </>
  );
}
