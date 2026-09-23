import type { Metadata } from 'next';
import Link from 'next/link';
import { readableComplaints } from '@/lib/complaints/queries';
import { OPEN_STATUSES, STATUS_LABELS } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { guardPage } from '@/lib/page-guard';
import { scopeFilter } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { COMPLAINT_STATUSES } from '@/lib/validation/complaints';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form-controls';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الشكاوى' };

const PAGE_SIZE = 25;

type Search = { status?: string; committee?: string; q?: string; page?: string };

function hrefWith(params: Search, patch: Partial<Search>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v));
  const qs = next.toString();
  return `/admin/complaints${qs ? `?${qs}` : ''}`;
}

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/complaints', 'complaints:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;
  const scope = readableComplaints(user);
  if (!scope) return <Forbidden backHref={backHref} />;

  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim() ?? '';
  const status = params.status ?? '';
  const filters: Prisma.ComplaintWhereInput[] = [scope];
  if (status === 'open') filters.push({ status: { in: OPEN_STATUSES } });
  else if ((COMPLAINT_STATUSES as readonly string[]).includes(status)) {
    filters.push({ status: status as (typeof COMPLAINT_STATUSES)[number] });
  }
  if (params.committee) filters.push({ committeeId: params.committee });
  if (q) {
    filters.push({
      OR: [{ reference: { contains: q.toUpperCase() } }, { title: { contains: q, mode: 'insensitive' } }],
    });
  }
  const where: Prisma.ComplaintWhereInput = { AND: filters };

  // قائمة اللجان في الفلتر: لجانه فقط ما لم يملك نطاق «الكل»
  const readable = scopeFilter(user, 'complaints:read');
  const [rows, total, committees] = await Promise.all([
    db.complaint.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
        category: { select: { nameAr: true } },
        area: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
    db.committee.findMany({
      where: readable?.all ? {} : { id: { in: readable?.committees ?? [] } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameAr: true },
    }),
  ]);
  const filtered = !!(status || params.committee || q);

  return (
    <>
      <PageHeader title="الشكاوى" description="كل الشكاوى التي يحق لك رؤيتها بحسب دورك. بيانات التواصل لا تظهر هنا." />

      <Card className="mb-4 p-3">
        <form action="/admin/complaints" className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end" role="search">
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">الحالة</Label>
            <Select id="status" name="status" defaultValue={status}>
              <option value="">كل الحالات</option>
              <option value="open">المفتوحة</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="committee">اللجنة</Label>
            <Select id="committee" name="committee" defaultValue={params.committee ?? ''}>
              <option value="">كل اللجان</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="q">بحث</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="الرقم المرجعي أو العنوان" />
          </div>
          <div className="flex gap-2">
            <Button type="submit">تصفية</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/admin/complaints">مسح</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        empty={
          filtered
            ? { title: 'لا نتائج لهذه التصفية', hint: 'غيّر الحالة أو اللجنة أو نص البحث، أو امسح التصفية.' }
            : { title: 'لا شكاوى في نطاقك بعد', hint: 'حين تُحوَّل شكوى إلى لجنتك تظهر هنا فورًا، ويصلك إشعار بها.' }
        }
        pagination={{ page, pageSize: PAGE_SIZE, total, hrefFor: (p) => hrefWith(params, { page: String(p) }) }}
        columns={[
          {
            key: 'title',
            header: 'الشكوى',
            cell: (c) => (
              <Link href={`/admin/complaints/${c.id}`} className="flex flex-col hover:underline">
                <span className="font-medium text-brand">{c.title}</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {c.reference}
                </span>
              </Link>
            ),
          },
          { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
          { key: 'committee', header: 'اللجنة', className: 'hidden md:table-cell', cell: (c) => c.committee?.nameAr ?? '—' },
          { key: 'category', header: 'التصنيف', className: 'hidden lg:table-cell', cell: (c) => c.category?.nameAr ?? '—' },
          { key: 'area', header: 'المنطقة', className: 'hidden lg:table-cell', cell: (c) => c.area?.nameAr ?? '—' },
          { key: 'updated', header: 'آخر تحديث', className: 'hidden sm:table-cell', cell: (c) => formatDate(c.updatedAt) },
        ]}
      />
    </>
  );
}
