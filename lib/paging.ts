// ترقيم الصفحات — مشترك بين صفحات الويب (?page=) وواجهة الجوّال (?page=&pageSize=)

export type Page = { page: number; pageSize: number };
export type Paged<T> = Page & { items: T[]; total: number };

/** رقم صحيح ≥ 1، وحجم صفحة لا يتجاوز الأقصى */
export function toPage(raw: string | null | undefined, pageSize: number, rawSize?: string | null, maxSize = 50): Page {
  const size = Math.floor(Number(rawSize));
  return {
    page: Math.max(1, Math.floor(Number(raw)) || 1),
    pageSize: Number.isInteger(size) && size > 0 ? Math.min(size, maxSize) : pageSize,
  };
}

export const skipTake = ({ page, pageSize }: Page) => ({ skip: (page - 1) * pageSize, take: pageSize });
