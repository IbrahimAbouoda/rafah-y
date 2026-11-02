/** شارة «بيئة تجريبية» في كل الصفحات خارج الإنتاج — AC-20 ③ */
export function DemoBadge() {
  if (process.env.NODE_ENV === 'production' && process.env.APP_ENV !== 'staging') return null;
  return (
    <div role="note" className="bg-accent-solid px-4 py-1 text-center text-xs font-medium text-accent-solid-foreground">
      بيئة تجريبية — البيانات هنا للتجربة وليست بيانات حقيقية
    </div>
  );
}
