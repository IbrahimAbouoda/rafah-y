import 'server-only';
import { db } from '@/lib/db';

// الجداول المرجعية التي يعرضها الويب ويقرؤها الجوّال من /config — مصدر واحد، لا قوائم ثابتة في الواجهة.

export type Option = { id: string; nameAr: string };

/** تصنيفات الشكاوى النشطة والمناطق — نموذج تقديم الشكوى (الحساب والزائر) */
export async function complaintFormOptions(): Promise<{ categories: Option[]; areas: Option[] }> {
  const [categories, areas] = await Promise.all([
    db.complaintCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true },
    }),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
  ]);
  return { categories, areas };
}

/** اللجان النشطة بحقولها العامة فقط */
export async function activeCommittees(): Promise<{ id: string; slug: string; nameAr: string }[]> {
  return db.committee.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, slug: true, nameAr: true },
  });
}
