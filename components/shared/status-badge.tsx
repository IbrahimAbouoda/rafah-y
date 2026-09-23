import { CheckCircle2, Circle, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/complaints/workflow';
import { cn } from '@/lib/utils';

// لون + أيقونة + نص دائمًا — لا يُعتمد اللون وحده (PRD §12 StatusBadge).
// Sprint 0: حالات الإعدادات · Sprint 1: complaint · السبرنتات التالية تضيف idea | task …
type Tone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

const STATUSES: Record<string, Record<string, { label: string; tone: Tone }>> = {
  active: {
    true: { label: 'نشط', tone: 'success' },
    false: { label: 'معطّل', tone: 'neutral' },
  },
  assignment: {
    active: { label: 'فعّال', tone: 'success' },
    expiring: { label: 'مؤقت', tone: 'warning' },
    revoked: { label: 'مسحوب', tone: 'neutral' },
    inactive: { label: 'غير فعّال', tone: 'neutral' },
  },
  term: {
    current: { label: 'الدورة الحالية', tone: 'success' },
    past: { label: 'منتهية', tone: 'neutral' },
  },
  complaint: {
    SUBMITTED: { label: STATUS_LABELS.SUBMITTED, tone: 'info' },
    UNDER_REVIEW: { label: STATUS_LABELS.UNDER_REVIEW, tone: 'info' },
    ASSIGNED: { label: STATUS_LABELS.ASSIGNED, tone: 'info' },
    COMMITTEE_REVIEW: { label: STATUS_LABELS.COMMITTEE_REVIEW, tone: 'warning' },
    REFERRED: { label: STATUS_LABELS.REFERRED, tone: 'warning' },
    WAITING_RESPONSE: { label: STATUS_LABELS.WAITING_RESPONSE, tone: 'warning' },
    IN_PROGRESS: { label: STATUS_LABELS.IN_PROGRESS, tone: 'warning' },
    RESOLVED: { label: STATUS_LABELS.RESOLVED, tone: 'success' },
    CLOSED: { label: STATUS_LABELS.CLOSED, tone: 'neutral' },
    DISMISSED: { label: STATUS_LABELS.DISMISSED, tone: 'danger' },
  },
  file: {
    PENDING: { label: 'قيد الفحص', tone: 'warning' },
    CLEAN: { label: 'سليم', tone: 'success' },
    INFECTED: { label: 'مرفوض', tone: 'danger' },
    FAILED: { label: 'مرفوض', tone: 'danger' },
  },
};

const TONES: Record<Tone, { className: string; icon: LucideIcon }> = {
  success: { className: 'bg-success-soft text-success', icon: CheckCircle2 },
  warning: { className: 'bg-warning-soft text-warning', icon: Clock },
  info: { className: 'bg-info-soft text-info', icon: Circle },
  danger: { className: 'bg-danger-soft text-danger', icon: XCircle },
  neutral: { className: 'bg-muted text-muted-foreground', icon: Circle },
};

export function StatusBadge({ kind, status, size = 'sm' }: { kind: string; status: string; size?: 'sm' | 'md' }) {
  // حالة غير معروفة تُعرض رمادية بنصها الخام لا بانهيار
  const def = STATUSES[kind]?.[status] ?? { label: status, tone: 'neutral' as const };
  const tone = TONES[def.tone];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        tone.className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      {def.label}
    </span>
  );
}
