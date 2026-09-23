import 'server-only';
import { writeAudit } from '@/lib/audit';
import { encryptField } from '@/lib/crypto';
import { db } from '@/lib/db';
import { conflict, invalid, rateLimited } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import { dispatchEmails, queueNotifications } from '@/lib/notify';
import { limit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/rbac';
import { nextRef } from '@/lib/sequence';
import type { SubmitComplaintInput } from '@/lib/validation/complaints';
import { formatAccessCode, generateAccessCode, hashAccessCode } from './access-code';

// إنشاء الشكوى — PRD §5.1 خطوات 1–4 · AC-01 · AC-17. مشترك بين الحساب والزائر.

export type SubmitResult = { id: string; reference: string; accessCode: string; duplicate: boolean };

type Origin =
  /** شاب مسجّل — submitterId = حسابه، إلا إن أخفى هويته */
  | { kind: 'account'; user: SessionUser }
  /** زائر بلا حساب — submitterId = NULL دائمًا، والـ IP لعدّاد الحد فقط */
  | { kind: 'public'; ip: string };

/** نافذة إعادة الإرسال: بعدها لا تُعاد الشكوى نفسها بـ clientDraftId (ولا يُدوَّر رمزها). */
const RESUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * AC-17 ②: نفس clientDraftId ثلاث مرات = شكوى واحدة.
 * الجهاز الذي يعيد الإرسال لم يستلم الرمز (وإلا لما أعاد)، والخادم لا يحفظ إلا تجزئته،
 * فيُدوَّر الرمز ويُعاد مع الرقم نفسه. clientDraftId عشوائي لا يغادر الجهاز، فهو إثبات الملكية.
 */
async function resubmission(data: SubmitComplaintInput, origin: Origin): Promise<SubmitResult | null> {
  const existing = await db.complaint.findUnique({
    where: { clientDraftId: data.clientDraftId },
    select: { id: true, reference: true, status: true, submitterId: true, isAnonymous: true, createdAt: true },
  });
  if (!existing) return null;

  const sameOwner =
    existing.isAnonymous ||
    (origin.kind === 'account' ? existing.submitterId === origin.user.id : existing.submitterId === null);
  const fresh = Date.now() - existing.createdAt.getTime() < RESUBMIT_WINDOW_MS;
  if (!sameOwner || !fresh || existing.status !== 'SUBMITTED') {
    throw conflict('هذه المسودة أُرسلت من قبل. ابدأ شكوى جديدة من «تقديم شكوى»، أو تابع السابقة برقمها.');
  }

  const code = generateAccessCode();
  await db.complaint.update({ where: { id: existing.id }, data: { accessCodeHash: await hashAccessCode(code) } });
  return { id: existing.id, reference: existing.reference, accessCode: formatAccessCode(code), duplicate: true };
}

export async function submitComplaint(data: SubmitComplaintInput, origin: Origin): Promise<SubmitResult> {
  const again = await resubmission(data, origin);
  if (again) return again;

  // حد المعدل بعد فحص الإعادة: إعادة المحاولة لا تستهلك الحد (AC-17 ② مع §6.4)
  const gate =
    origin.kind === 'account' ? await limit('complaint', origin.user.id) : await limit('publicComplaint', origin.ip);
  if (!gate.allowed) throw rateLimited(gate.retryAfterSec);

  const [category, area] = await Promise.all([
    db.complaintCategory.findFirst({ where: { id: data.categoryId, isActive: true }, select: { id: true } }),
    data.areaId ? db.area.findUnique({ where: { id: data.areaId }, select: { id: true } }) : null,
  ]);
  if (!category) throw invalid('التصنيف غير موجود أو معطّل. اختر تصنيفًا من القائمة.', { categoryId: ['اختر تصنيفًا نشطًا.'] });
  if (data.areaId && !area) throw invalid('المنطقة غير موجودة. اختر منطقة من القائمة.', { areaId: ['اختر منطقة من القائمة.'] });

  // §6.7: الشكوى المجهولة لا تُربط بالحساب إطلاقًا — لا في السجل ولا في الحدث ولا في التدقيق
  const submitter = origin.kind === 'account' && !data.isAnonymous ? origin.user : null;
  const hasContact = !data.isAnonymous && !!(data.contactName || data.contactPhone || data.contactEmail);
  const code = generateAccessCode();
  const accessCodeHash = await hashAccessCode(code);

  let result: { id: string; reference: string; emailIds: string[] };
  try {
    result = await db.$transaction(async (tx) => {
      const reference = await nextRef(tx, 'CMP');
      const complaint = await tx.complaint.create({
        data: {
          reference,
          accessCodeHash,
          clientDraftId: data.clientDraftId,
          title: data.title,
          body: data.body,
          isAnonymous: data.isAnonymous,
          submitterId: submitter?.id ?? null,
          categoryId: category.id,
          areaId: area?.id ?? null,
        },
      });
      if (hasContact) {
        await tx.complaintContact.create({
          data: {
            complaintId: complaint.id,
            nameEnc: data.contactName ? encryptField(data.contactName) : null,
            phoneEnc: data.contactPhone ? encryptField(data.contactPhone) : null,
            emailEnc: data.contactEmail ? encryptField(data.contactEmail) : null,
            preferredChannel: data.preferredChannel ?? null,
          },
        });
      }
      await tx.complaintEvent.create({
        data: {
          complaintId: complaint.id,
          toStatus: 'SUBMITTED',
          isPublic: true,
          note: 'استُلمت الشكوى وسُجّلت برقمها المرجعي.',
          actorId: submitter?.id ?? null,
        },
      });
      await writeAudit(
        tx,
        submitter,
        'complaint.create',
        'Complaint',
        complaint.id,
        null,
        {
          reference,
          status: complaint.status,
          isAnonymous: complaint.isAnonymous,
          categoryId: complaint.categoryId,
          areaId: complaint.areaId,
          hasContact,
        },
        // بلا IP أبدًا مع الشكوى (§6.7) — والمصدر يميّز الزائر عن الحساب المجهول دون كشف الحساب
        submitter ? {} : { source: origin.kind === 'public' ? 'public' : 'anonymous' },
      );
      const emailIds = await queueNotifications(tx, [
        {
          type: 'COMPLAINT_RECEIVED',
          title: `استلمنا شكواك ${reference}`,
          body: 'ستصلك الإشعارات هنا مع كل تحديث عام على مسارها.',
          link: `/me/complaints/${reference}`,
          userIds: [submitter?.id],
          email: true,
        },
      ]);
      return { id: complaint.id, reference, emailIds };
    });
  } catch (e) {
    // إرسالان متزامنان بنفس المسودة: الثاني يصطدم بالقيد الفريد فيعود إلى مسار الإعادة
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const raced = await resubmission(data, origin);
      if (raced) return raced;
    }
    throw e;
  }

  await dispatchEmails(db, result.emailIds);
  return { id: result.id, reference: result.reference, accessCode: formatAccessCode(code), duplicate: false };
}
