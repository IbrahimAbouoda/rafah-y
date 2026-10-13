import type { Metadata } from 'next';
import Link from 'next/link';
import { isLive } from '@/lib/assignments';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { UserRolesPanel } from './user-roles-panel';
import { userList } from '@/lib/settings/queries';
import { toPage } from '@/lib/paging';

export const metadata: Metadata = { title: 'المستخدمون والأدوار' };

const PAGE_SIZE = 20;

type Search = { q?: string; page?: string; user?: string };

function hrefWith(params: Search, patch: Partial<Search>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v));
  const qs = next.toString();
  return `/admin/settings/users${qs ? `?${qs}` : ''}`;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user: me, allowed, backHref } = await guardPage('/admin/settings/users', 'users:manage_roles');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const { items: users, total, q, page } = await userList(me, params.q, toPage(params.page, PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="المستخدمون والأدوار"
        description="عيّن الأدوار واسحبها. عضوية اللجنة هي تعيين دور مقيّد بلجنة في الدورة الحالية، وسحب الدور يسري في الطلب التالي للمستخدم."
      />
      <div className={params.user ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]' : ''}>
        <DataTable
          rows={users}
          rowKey={(u) => u.id}
          search={{ name: 'q', value: q, placeholder: 'ابحث بالاسم أو البريد أو الهاتف', action: '/admin/settings/users' }}
          empty={
            q
              ? { title: 'لا نتائج لهذا البحث', hint: 'جرّب جزءًا من الاسم أو البريد، أو امسح البحث لعرض الجميع.' }
              : { title: 'لا مستخدمين بعد', hint: 'يظهر هنا كل من ينشئ حسابًا من صفحة التسجيل، ثم تعيّن له دوره.' }
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, hrefFor: (p) => hrefWith(params, { page: String(p) }) }}
          columns={[
            {
              key: 'name',
              header: 'الاسم',
              cell: (u) => (
                <Link
                  href={hrefWith(params, { user: u.id })}
                  className="font-medium text-brand hover:underline"
                  aria-current={params.user === u.id ? 'true' : undefined}
                >
                  {u.fullName}
                </Link>
              ),
            },
            {
              key: 'contact',
              header: 'الدخول بـ',
              cell: (u) => (
                <span dir="ltr" className="text-muted-foreground">
                  {u.email ?? u.phone ?? '—'}
                </span>
              ),
            },
            {
              key: 'roles',
              header: 'الأدوار الفعّالة',
              cell: (u) => {
                const live = u.roleAssignments.filter((a) => isLive(a));
                return live.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {live.map((a) => (
                      <span key={a.id} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                        {a.role.nameAr}
                        {a.committee ? ` · ${a.committee.nameAr}` : ''}
                      </span>
                    ))}
                  </div>
                );
              },
            },
            { key: 'created', header: 'التسجيل', cell: (u) => formatDate(u.createdAt), className: 'hidden md:table-cell' },
          ]}
        />
        {params.user ? <UserRolesPanel userId={params.user} actor={me} closeHref={hrefWith(params, { user: undefined })} /> : null}
      </div>
    </>
  );
}
