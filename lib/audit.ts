import 'server-only';
import type { Tx } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { roleLabels, type SessionUser } from '@/lib/rbac';

// قائمة العمليات الحساسة — PRD §6.9
export type AuditAction =
  | 'complaint.create'
  | 'complaint.triage'
  | 'complaint.assign'
  | 'complaint.status_change'
  | 'complaint.refer'
  | 'complaint.close'
  | 'complaint.contact_read'
  | 'idea.review'
  | 'idea.approve'
  | 'idea.merge'
  | 'initiative.approve'
  | 'need.change'
  | 'offer.decide'
  | 'funding.record'
  | 'funding.approve'
  | 'task.assign'
  | 'task.approve'
  | 'opportunity.publish'
  | 'application.view'
  | 'report.publish'
  | 'role.assign'
  | 'role.revoke'
  | 'term.change'
  // محو الحساب (Sprint 6 · Q13 — قرار 2026-09-30): حذف فعلي لحساب بلا أثر، وإلا تجهيل
  | 'user.delete'
  | 'user.anonymize'
  | 'settings.change'
  | 'faq.create'
  | 'faq.update'
  | 'faq.disable'
  | 'inquiry.answer'
  | 'media.review'
  | 'media.publish'
  | 'conceptnote.approve'
  | 'conceptnote.send'
  | 'file.download'
  // التصدير (Sprint 5 — المحور ٣، بطلب صاحب المشروع 2026-09-28): كل ملف مُصدَّر يُسجَّل بمن صدّره ونطاقه
  | 'report.export'
  | 'complaint.export'
  | 'application.export'
  | 'attendance.export';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** يحوّل القيم إلى JSON آمن: Decimal ← نص، BigInt ← نص، Date ← ISO، والبايتات المشفّرة لا تُنسخ أبدًا. */
export function toAuditJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return '[encrypted]';
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(toAuditJson);
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) out[k] = toAuditJson(v);
    return out;
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

/**
 * يكتب سطر تدقيق داخل نفس المعاملة (C14). actor = null لعمليات النظام (التسجيل، أمر CLI).
 * ip لا يُمرَّر أبدًا مع شكوى مجهولة (§6.7).
 */
export async function writeAudit(
  tx: Tx,
  actor: SessionUser | null,
  action: AuditAction,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  opts: { ip?: string | null; source?: string } = {},
) {
  const afterJson = toAuditJson(after);
  await tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorRoles: actor ? roleLabels(actor) : opts.source ? [`system:${opts.source}`] : ['system'],
      action,
      entityType,
      entityId,
      before: before === undefined || before === null ? undefined : (toAuditJson(before) as object),
      after: afterJson === null ? undefined : (afterJson as object),
      ip: opts.ip ?? null,
    },
  });
}
