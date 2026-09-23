// أخطاء التطبيق برسائل عربية تقول ما الخطأ وكيف يُصلَح (CLAUDE.md «مطلوب دائمًا»)

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'RATE_LIMITED',
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = () =>
  new AppError('انتهت جلستك أو لم تسجّل الدخول بعد. سجّل الدخول ثم أعد المحاولة.', 'UNAUTHENTICATED');

export const forbidden = () =>
  new AppError(
    'لا تملك صلاحية هذا الإجراء. إن كنت تحتاجه، اطلب من رئيس المجلس أو المدير التقني تعيين الدور المناسب لك.',
    'FORBIDDEN',
  );

export const notFound = (what: string) =>
  new AppError(`${what} غير موجود، أو حُذف. حدّث الصفحة وتأكد من اختيارك.`, 'NOT_FOUND');

export const conflict = (message: string) => new AppError(message, 'CONFLICT');

export const invalid = (message: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(message, 'INVALID', fieldErrors);

export const rateLimited = (retryAfterSec: number) => {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return new AppError(`محاولات كثيرة خلال وقت قصير. انتظر ${minutes} دقيقة ثم أعد المحاولة.`, 'RATE_LIMITED');
};
