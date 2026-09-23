import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { Card } from '@/components/ui/surface';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from './states';

// DataTable — PRD §12. الترتيب والتصفية والصفحات من الخادم عبر searchParams،
// والأعمدة الحساسة لا تُرسل أصلًا لمن لا يملك صلاحيتها (تُحذف من الاستعلام، لا تُخفى هنا).

export type Column<T> = { key: string; header: string; cell: (row: T) => React.ReactNode; className?: string };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  pagination,
  search,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: { title: string; hint: string };
  pagination?: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string };
  search?: { name: string; value: string; placeholder: string; action: string };
}) {
  const pages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;
  return (
    <Card>
      {search ? (
        <form action={search.action} className="flex gap-2 border-b p-3" role="search">
          <Input name={search.name} defaultValue={search.value} placeholder={search.placeholder} aria-label={search.placeholder} />
          <Button type="submit" variant="outline" aria-label="بحث">
            <Search aria-hidden />
          </Button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={empty.title} hint={empty.hint} />
      ) : (
        <Table>
          <THead>
            <TR>
              {columns.map((c) => (
                <TH key={c.key} className={c.className}>
                  {c.header}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={rowKey(row)}>
                {columns.map((c) => (
                  <TD key={c.key} className={c.className}>
                    {c.cell(row)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {pagination && pages > 1 ? (
        <nav aria-label="الصفحات" className="flex items-center justify-between border-t p-3 text-sm">
          <span className="text-muted-foreground">
            صفحة {pagination.page} من {pages} · {pagination.total} سجل
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pagination.hrefFor(pagination.page - 1)}>
                  <ChevronLeft aria-hidden className="flip-rtl" />
                  السابقة
                </Link>
              </Button>
            ) : null}
            {pagination.page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pagination.hrefFor(pagination.page + 1)}>
                  التالية
                  <ChevronRight aria-hidden className="flip-rtl" />
                </Link>
              </Button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </Card>
  );
}
