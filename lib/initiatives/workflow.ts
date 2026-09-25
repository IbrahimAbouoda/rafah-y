import type { InitiativeStatus, NeedStatus, SupportType } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';

// مسار المبادرة — PRD §5.3 · D25 (لا مرحلة بلدية). المصدر الوحيد للانتقالات المسموحة.
// النشر العام يمرّ بـ initiatives:approve من الرئيس قبل الظهور في /initiatives.

type Transition = { to: InitiativeStatus; permission: PermissionKey };

export const INITIATIVE_TRANSITIONS: Record<InitiativeStatus, Transition[]> = {
  DRAFT: [
    { to: 'PENDING_APPROVAL', permission: 'initiatives:update' },
    { to: 'CANCELLED', permission: 'initiatives:approve' },
  ],
  PENDING_APPROVAL: [
    { to: 'PUBLISHED', permission: 'initiatives:approve' },
    // إعادة للتعديل قبل النشر
    { to: 'DRAFT', permission: 'initiatives:approve' },
    { to: 'CANCELLED', permission: 'initiatives:approve' },
  ],
  PUBLISHED: [
    { to: 'IN_PROGRESS', permission: 'initiatives:update' },
    { to: 'CANCELLED', permission: 'initiatives:approve' },
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', permission: 'initiatives:update' },
    { to: 'CANCELLED', permission: 'initiatives:approve' },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

export function initiativeTransitionPermission(from: InitiativeStatus, to: InitiativeStatus): PermissionKey | null {
  return INITIATIVE_TRANSITIONS[from].find((t) => t.to === to)?.permission ?? null;
}

export function nextInitiativeStatuses(from: InitiativeStatus, permission: PermissionKey): InitiativeStatus[] {
  return INITIATIVE_TRANSITIONS[from].filter((t) => t.permission === permission).map((t) => t.to);
}

/** تظهر للعامة في /initiatives و /support — بعد اعتماد الرئيس فقط (AC-09 · §5.3) */
export const PUBLIC_INITIATIVE_STATUSES: InitiativeStatus[] = ['PUBLISHED', 'IN_PROGRESS', 'COMPLETED'];

/** تقبل عروض دعم: منشورة أو قيد التنفيذ */
export const OFFERABLE_INITIATIVE_STATUSES: InitiativeStatus[] = ['PUBLISHED', 'IN_PROGRESS'];

/** «تحتاج دعمًا» — المغطّى والملغى لا يظهران (AC-09 ③) */
export const OPEN_NEED_STATUSES: NeedStatus[] = ['OPEN', 'PARTIALLY_COVERED'];

export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, string> = {
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار اعتماد الرئيس',
  PUBLISHED: 'منشورة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

export const NEED_STATUS_LABELS: Record<NeedStatus, string> = {
  OPEN: 'تحتاج دعمًا',
  PARTIALLY_COVERED: 'مغطّاة جزئيًا',
  COVERED: 'مغطّاة',
  CANCELLED: 'ملغاة',
};

export const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  FUNDING: 'تمويل',
  TRAINER: 'مدرّب',
  VENUE: 'مكان',
  EQUIPMENT: 'معدات',
  EXPERTISE: 'خبرة',
  MATERIALS: 'مواد',
  OTHER: 'أخرى',
};

// ─── المال — منطق خالص قابل للاختبار ─────────────────────────────────

type Money = { toString(): string };

export type FundingRow = {
  direction: 'INCOMING' | 'OUTGOING';
  amount: Money;
  currency: string;
  approvedAt: Date | null;
};

/**
 * المبلغ المؤمَّن (§5.3): مشتق من مجموع القيود الواردة المعتمدة فقط — لا حقل يُكتب يدويًا.
 * بالعملة لكل عملة على حدة (ILS و USD لا تُجمعان). الحساب بالقروش لتفادي أخطاء الفاصلة العائمة.
 */
export function securedTotals(rows: FundingRow[]): Record<string, string> {
  const cents = new Map<string, bigint>();
  for (const r of rows) {
    if (r.direction !== 'INCOMING' || !r.approvedAt) continue;
    cents.set(r.currency, (cents.get(r.currency) ?? 0n) + toCents(r.amount));
  }
  return Object.fromEntries([...cents].map(([c, v]) => [c, fromCents(v)]));
}

export function toCents(amount: Money): bigint {
  const [whole = '0', frac = ''] = amount.toString().split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  return sign * (BigInt(whole.replace('-', '')) * 100n + BigInt((frac + '00').slice(0, 2)));
}

export function fromCents(v: bigint): string {
  const sign = v < 0n ? '-' : '';
  const abs = v < 0n ? -v : v;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * حالة الاحتياج بعد قبول العروض (§5.3 «القبول يغيّر حالة الاحتياج»):
 * غير المالي يُغطّى بعرض مقبول واحد؛ المالي يُغطّى حين تبلغ العروض المقبولة بعملته مبلغه، وإلا فجزئيًا.
 */
export function coveredStatus(
  need: { type: SupportType; amount: Money | null; currency?: string },
  acceptedOffers: { amount: Money | null; currency: string }[],
): NeedStatus {
  if (acceptedOffers.length === 0) return 'OPEN';
  if (need.type !== 'FUNDING' || !need.amount) return 'COVERED';
  const currency = need.currency ?? 'ILS';
  const got = acceptedOffers
    .filter((o) => o.amount && o.currency === currency)
    .reduce((sum, o) => sum + toCents(o.amount!), 0n);
  return got >= toCents(need.amount) ? 'COVERED' : 'PARTIALLY_COVERED';
}

export function formatMoney(amount: string | Money, currency: string): string {
  const n = Number(amount.toString());
  const symbol = currency === 'USD' ? '$' : '₪';
  return `${n.toLocaleString('ar-PS-u-nu-latn', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
}
