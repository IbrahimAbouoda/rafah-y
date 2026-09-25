import type { ORGANIZATION_TYPES } from '@/lib/validation/initiatives';

// تسميات العرض للمؤسسات — مشتركة بين الصفحات

export const ORG_TYPE_LABELS: Record<(typeof ORGANIZATION_TYPES)[number], string> = {
  LOCAL_NGO: 'مؤسسة محلية',
  INTERNATIONAL_NGO: 'منظمة دولية',
  UN_AGENCY: 'وكالة أممية',
  GOVERNMENT: 'جهة حكومية',
  PRIVATE_SECTOR: 'قطاع خاص',
  ACADEMIC: 'جهة أكاديمية',
  DONOR: 'جهة مانحة',
  OTHER: 'أخرى',
};

export const STAGE_LABELS = {
  PROSPECT: 'محتملة',
  CONTACTED: 'تم التواصل',
  PROPOSAL_SENT: 'أُرسل مقترح',
  NEGOTIATION: 'تفاوض',
  ACTIVE: 'شراكة نشطة',
  DORMANT: 'خاملة',
} as const;

export const INTERACTION_LABELS = {
  CALL: 'اتصال',
  MEETING: 'اجتماع',
  PROPOSAL_SENT: 'إرسال مقترح',
  EMAIL: 'بريد',
  VISIT: 'زيارة',
  OTHER: 'أخرى',
} as const;
