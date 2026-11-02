/**
 * ظهور انسيابي للصفحة عند كل انتقال — يُستعمل من template.tsx في كل مجموعة مسارات، فيُعاد تركيبه مع كل صفحة.
 * CSS فقط (animate-page-in في globals.css)، ويتوقف لمن طلب تقليل الحركة.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page-in">{children}</div>;
}
