import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as closeComplaint } from '@/app/api/mobile/v1/admin/complaints/[id]/close/route';
import { POST as dismissComplaint } from '@/app/api/mobile/v1/admin/complaints/[id]/dismiss/route';
import { POST as openTriage } from '@/app/api/mobile/v1/admin/complaints/[id]/open-triage/route';
import { POST as referComplaint } from '@/app/api/mobile/v1/admin/complaints/[id]/refer/route';
import { POST as assignComplaint } from '@/app/api/mobile/v1/admin/complaints/[id]/assign/route';
import { POST as complaintStatus } from '@/app/api/mobile/v1/admin/complaints/[id]/status/route';
import { POST as approveNote } from '@/app/api/mobile/v1/admin/concept-notes/[id]/approve/route';
import { POST as markSent } from '@/app/api/mobile/v1/admin/concept-notes/[id]/mark-sent/route';
import { PATCH as editNote } from '@/app/api/mobile/v1/admin/concept-notes/[id]/route';
import { POST as setThreshold } from '@/app/api/mobile/v1/admin/demand/polls/[id]/threshold/route';
import { POST as createPoll } from '@/app/api/mobile/v1/admin/demand/polls/route';
import { POST as mergeIdea } from '@/app/api/mobile/v1/admin/ideas/[id]/merge/route';
import { POST as reviewIdea } from '@/app/api/mobile/v1/admin/ideas/[id]/review/route';
import { POST as addNeed } from '@/app/api/mobile/v1/admin/initiatives/[id]/needs/route';
import { POST as progress } from '@/app/api/mobile/v1/admin/initiatives/[id]/progress/route';
import { GET as initiativeFile, PATCH as editInitiative } from '@/app/api/mobile/v1/admin/initiatives/[id]/route';
import { POST as initiativeStatus } from '@/app/api/mobile/v1/admin/initiatives/[id]/status/route';
import { POST as postUpdate } from '@/app/api/mobile/v1/admin/initiatives/[id]/updates/route';
import { POST as createInitiative } from '@/app/api/mobile/v1/admin/initiatives/route';
import { POST as removeNeed } from '@/app/api/mobile/v1/admin/needs/[id]/remove/route';
import { POST as logInteraction } from '@/app/api/mobile/v1/admin/organizations/[id]/interactions/route';
import { POST as unlinkMember } from '@/app/api/mobile/v1/admin/organizations/[id]/members/remove/route';
import { POST as linkMember } from '@/app/api/mobile/v1/admin/organizations/[id]/members/route';
import { PATCH as editOrganization } from '@/app/api/mobile/v1/admin/organizations/[id]/route';
import { POST as setStage } from '@/app/api/mobile/v1/admin/organizations/[id]/stage/route';
import { POST as createOrganization } from '@/app/api/mobile/v1/admin/organizations/route';
import { PATCH as editArea } from '@/app/api/mobile/v1/admin/settings/areas/[id]/route';
import { POST as createArea } from '@/app/api/mobile/v1/admin/settings/areas/route';
import { PATCH as editCategory } from '@/app/api/mobile/v1/admin/settings/categories/[id]/route';
import { POST as createCategory } from '@/app/api/mobile/v1/admin/settings/categories/route';
import { PATCH as editCommittee } from '@/app/api/mobile/v1/admin/settings/committees/[id]/route';
import { POST as createCommittee } from '@/app/api/mobile/v1/admin/settings/committees/route';
import { POST as startTerm } from '@/app/api/mobile/v1/admin/settings/terms/route';
import { POST as commentTask } from '@/app/api/mobile/v1/admin/tasks/[id]/comments/route';
import { POST as reassignTask } from '@/app/api/mobile/v1/admin/tasks/[id]/reassign/route';
import { POST as createTask } from '@/app/api/mobile/v1/admin/tasks/route';
import { POST as demandVote } from '@/app/api/mobile/v1/demand/votes/route';
import { POST as submitIdea } from '@/app/api/mobile/v1/me/ideas/route';
import { POST as submitComplaint } from '@/app/api/mobile/v1/me/complaints/route';
import { GET as publicInitiative } from '@/app/api/mobile/v1/public/initiatives/[slug]/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { actAs, categoryId, committeeId, createUser, freshIp } from '../../support/factories';

// واجهة الجوّال — كل إجراء إداري بمساره السعيد ورفض غير المخوَّل

const tag = () => randomUUID().slice(0, 8);

beforeEach(() => {
  freshIp();
});

async function complaintAt(status: 'UNDER_REVIEW' | 'COMMITTEE_REVIEW' | 'RESOLVED') {
  const youth = await createUser(['youth']);
  await actAs(youth.id);
  const submitted = await call<{ id: string }>(submitComplaint, {
    body: {
      clientDraftId: randomUUID(),
      title: 'حفرة في الطريق',
      body: 'حفرة كبيرة في منتصف الطريق تسبب حوادث للدراجات ليلًا.',
      categoryId: await categoryId(),
    },
  });
  const id = submitted.data.id;
  const president = await createUser(['council_president']);
  await actAs(president.id);
  await call(openTriage, { params: { id }, body: {} });
  if (status === 'UNDER_REVIEW') return { id, youth, president };
  await call(assignComplaint, { params: { id }, body: { committeeId: await committeeId('legal-affairs') } });
  await call(complaintStatus, { params: { id }, body: { toStatus: 'COMMITTEE_REVIEW' } });
  if (status === 'COMMITTEE_REVIEW') return { id, youth, president };
  await call(complaintStatus, { params: { id }, body: { toStatus: 'IN_PROGRESS' } });
  await call(complaintStatus, { params: { id }, body: { toStatus: 'RESOLVED', note: 'رُدمت الحفرة بالتنسيق مع البلدية.' } });
  return { id, youth, president };
}

describe('الشكاوى: إحالة وإغلاق واستبعاد', () => {
  it('الاستبعاد بسبب مكتوب · الشاب 403', async () => {
    const c = await complaintAt('UNDER_REVIEW');
    await actAs(c.youth.id);
    expect((await call(dismissComplaint, { params: { id: c.id }, body: { reason: 'شكوى مكررة لشكوى سابقة' } })).status).toBe(403);
    await actAs(c.president.id);
    expect((await call(dismissComplaint, { params: { id: c.id }, body: { reason: 'شكوى مكررة لشكوى سابقة' } })).status).toBe(200);
    expect((await db.complaint.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DISMISSED');
  });

  it('الإحالة لجهة خارجية', async () => {
    const c = await complaintAt('COMMITTEE_REVIEW');
    const res = await call(referComplaint, { params: { id: c.id }, body: { target: 'MUNICIPALITY', targetName: 'بلدية رفح' } });
    expect(res.status).toBe(200);
    expect(await db.complaintReferral.count({ where: { complaintId: c.id } })).toBe(1);
  });

  it('إغلاق المحلولة', async () => {
    const c = await complaintAt('RESOLVED');
    expect((await call(closeComplaint, { params: { id: c.id }, body: {} })).status).toBe(200);
    expect((await db.complaint.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CLOSED');
  });
});

describe('الأفكار: الدمج', () => {
  it('دمج فكرة في أخرى برقمها', async () => {
    const ids: string[] = [];
    const refs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const youth = await createUser(['youth']);
      await actAs(youth.id);
      const res = await call<{ id: string; reference: string }>(submitIdea, {
        body: {
          clientDraftId: randomUUID(),
          title: 'ملعب للحي الشرقي',
          problem: 'لا مكان آمن يلعب فيه الأطفال في الحي الشرقي.',
          solution: 'تسوية أرض فارغة وتجهيزها بمرمى وإنارة شمسية.',
        },
      });
      ids.push(res.data.id);
      refs.push(res.data.reference);
    }
    const president = await createUser(['council_president']);
    await actAs(president.id);
    for (const id of ids) await call(reviewIdea, { params: { id }, body: { toStatus: 'SCREENING' } });
    const res = await call(mergeIdea, { params: { id: ids[1]! }, body: { intoReference: refs[0] } });
    expect(res.status).toBe(200);
    expect((await db.idea.findUniqueOrThrow({ where: { id: ids[1]! } })).status).toBe('MERGED');
  });
});

describe('استطلاعات الطلب و Concept Note — AC-12', () => {
  it('استطلاع ← بلوغ الحد ← مسودة واحدة ← تحرير ← اعتماد ← إرسال', async () => {
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const title = `مجالات التدريب ${tag()}`;
    expect((await call(createPoll, { body: { title, proposalThreshold: 2, options: ['تصميم جرافيك', 'برمجة الويب'] } })).status).toBe(201);
    const poll = await db.demandPoll.findFirstOrThrow({ where: { title }, include: { options: true } });
    expect((await call(setThreshold, { params: { id: poll.id }, body: { proposalThreshold: 2, isActive: true } })).status).toBe(200);

    const option = poll.options[0]!;
    for (let i = 0; i < 2; i++) {
      const youth = await createUser(['youth']);
      await actAs(youth.id);
      expect((await call(demandVote, { body: { pollId: poll.id, optionId: option.id } })).status).toBe(200);
    }
    const note = await db.conceptNote.findFirstOrThrow({ where: { demandOptionId: option.id } });

    await actAs(president.id);
    // §16.1: لا إرسال قبل اعتماد بشري
    expect((await call(markSent, { params: { id: note.id }, body: {} })).status).toBeGreaterThanOrEqual(400);
    const body = 'مقترح تدريب في التصميم الجرافيكي لشباب رفح، بناءً على تصويت الشباب في استطلاع الطلب الأخير.';
    expect((await call(editNote, { method: 'PATCH', params: { id: note.id }, body: { title: 'مقترح تدريب تصميم', bodyMd: body } })).status).toBe(200);
    expect((await call(approveNote, { params: { id: note.id }, body: {} })).status).toBe(200);
    expect((await call(markSent, { params: { id: note.id }, body: {} })).status).toBe(200);

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(createPoll, { body: { title: 'استطلاع دخيل', proposalThreshold: 2, options: ['أ', 'ب'] } })).status).toBe(403);
  });
});

describe('ملف المبادرة', () => {
  it('تعديل وإنجاز وتحديث عام وإلغاء احتياج، والصفحة العامة بعد النشر', async () => {
    const slug = 'sports-arts';
    const head = await createUser([{ key: 'committee_head', committee: slug }]);
    await actAs(head.id);
    await call(createInitiative, { body: { committeeId: await committeeId(slug), title: `دوري الأحياء ${tag()}` } });
    const initiative = await db.initiative.findFirstOrThrow({ where: { createdById: head.id } });
    const id = initiative.id;

    expect((await call(editInitiative, { method: 'PATCH', params: { id }, body: { committeeId: initiative.committeeId, title: 'دوري الأحياء الرمضاني' } })).status).toBe(200);
    await call(addNeed, { params: { id }, body: { type: 'EQUIPMENT', description: 'كرات وشباك' } });
    await call(addNeed, { params: { id }, body: { type: 'OTHER', description: 'احتياج سيُلغى' } });
    const cancelled = await db.initiativeNeed.findFirstOrThrow({ where: { initiativeId: id, description: 'احتياج سيُلغى' } });
    expect((await call(removeNeed, { params: { id: cancelled.id }, body: {} })).status).toBe(200);

    await call(initiativeStatus, { params: { id }, body: { toStatus: 'PENDING_APPROVAL' } });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    await call(initiativeStatus, { params: { id }, body: { toStatus: 'PUBLISHED' } });

    await actAs(head.id);
    expect((await call(progress, { params: { id }, body: { progressPct: 40, beneficiariesReached: 120 } })).status).toBe(200);
    expect((await call(postUpdate, { params: { id }, body: { body: 'انطلقت مباريات الأسبوع الأول بمشاركة ثماني فرق.', isPublic: true } })).status).toBe(200);
    const file = await call<{ initiative: { progressPct: number }; transitions: unknown[] }>(initiativeFile, { params: { id } });
    expect(file.data.initiative.progressPct).toBe(40);

    await actAs(null);
    const pub = await call<{ updates: unknown[]; needs: { status: string }[] }>(publicInitiative, {
      auth: false,
      params: { slug: initiative.slug },
    });
    expect(pub.status).toBe(200);
    expect(pub.data.updates).toHaveLength(1);
    expect(pub.data.needs.every((n) => n.status !== 'CANCELLED')).toBe(true);
  });
});

describe('المؤسسات — CRM', () => {
  it('إنشاء وتعديل ومرحلة وتواصل وربط ممثّل وفكّه', async () => {
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const name = `جمعية الشباب ${tag()}`;
    expect((await call(createOrganization, { body: { name, type: 'LOCAL_NGO', sectors: ['تعليم'] } })).status).toBe(201);
    const org = await db.organization.findFirstOrThrow({ where: { name } });
    const id = org.id;
    expect((await call(editOrganization, { method: 'PATCH', params: { id }, body: { name, type: 'LOCAL_NGO', sectors: ['تعليم', 'صحة'], website: 'https://example.org' } })).status).toBe(200);
    expect((await call(setStage, { params: { id }, body: { stage: 'CONTACTED' } })).status).toBe(200);
    expect((await call(logInteraction, { params: { id }, body: { type: 'CALL', summary: 'اتصال تعريفي بالمنصة', occurredAt: '2026-10-01' } })).status).toBe(200);

    const rep = await createUser([]);
    expect((await call(linkMember, { params: { id }, body: { email: rep.email } })).status).toBe(200);
    expect((await call(unlinkMember, { params: { id }, body: { userId: rep.id } })).status).toBe(200);
    expect(await db.partnerMembership.count({ where: { organizationId: id, userId: rep.id } })).toBe(0);

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(createOrganization, { body: { name: 'مؤسسة دخيلة', type: 'LOCAL_NGO', sectors: [] } })).status).toBe(403);
  });
});

describe('المهام: تعليق وإعادة إسناد', () => {
  it('رئيس اللجنة يعيد الإسناد، والعضو يعلّق', async () => {
    const slug = 'health-affairs';
    const head = await createUser([{ key: 'committee_head', committee: slug }]);
    const a = await createUser([{ key: 'committee_member', committee: slug }]);
    const b = await createUser([{ key: 'committee_member', committee: slug }]);
    await actAs(head.id);
    await call(createTask, { body: { committeeId: await committeeId(slug), title: 'زيارة المركز الصحي', assigneeId: a.id } });
    const task = await db.task.findFirstOrThrow({ where: { assigneeId: a.id } });

    await actAs(a.id);
    expect((await call(commentTask, { params: { id: task.id }, body: { body: 'حدّدت موعدًا يوم الأحد.' } })).status).toBe(200);
    expect((await call(reassignTask, { params: { id: task.id }, body: { assigneeId: b.id } })).status).toBeGreaterThanOrEqual(403);

    await actAs(head.id);
    expect((await call(reassignTask, { params: { id: task.id }, body: { assigneeId: b.id } })).status).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBe(b.id);
  });
});

describe('الإعدادات — المدير التقني', () => {
  it('مناطق وتصنيفات ولجان (غير نشطة كي لا تمسّ بقية الاختبارات) · الرئيس 403 على settings:manage', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const areaName = `حي ${tag()}`;
    expect((await call(createArea, { body: { nameAr: areaName } })).status).toBe(201);
    const area = await db.area.findFirstOrThrow({ where: { nameAr: areaName } });
    expect((await call(editArea, { method: 'PATCH', params: { id: area.id }, body: { nameAr: `${areaName} الغربي` } })).status).toBe(200);

    const categoryName = `تصنيف ${tag()}`;
    expect((await call(createCategory, { body: { nameAr: categoryName, isActive: false, sortOrder: 999 } })).status).toBe(201);
    const category = await db.complaintCategory.findFirstOrThrow({ where: { nameAr: categoryName } });
    expect((await call(editCategory, { method: 'PATCH', params: { id: category.id }, body: { nameAr: categoryName, isActive: false, sortOrder: 998 } })).status).toBe(200);

    const committeeSlug = `test-${tag()}`;
    expect((await call(createCommittee, { body: { slug: committeeSlug, nameAr: 'لجنة اختبار', isActive: false, sortOrder: 999 } })).status).toBe(201);
    const committee = await db.committee.findUniqueOrThrow({ where: { slug: committeeSlug } });
    expect((await call(editCommittee, { method: 'PATCH', params: { id: committee.id }, body: { slug: committeeSlug, nameAr: 'لجنة اختبار معدّلة', isActive: false, sortOrder: 999 } })).status).toBe(200);

    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect((await call(createArea, { body: { nameAr: 'حي دخيل' } })).status).toBe(403);
  });

  it('بدء دورة جديدة (users:manage_roles) · الشاب 403', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(startTerm, { body: { name: 'دورة دخيلة', startsAt: '2027-01-01' } })).status).toBe(403);

    const current = await db.councilTerm.findFirstOrThrow({ where: { isCurrent: true } });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const res = await call(startTerm, { body: { name: `دورة اختبار ${tag()}`, startsAt: '2026-10-01' } });
    expect(res.status).toBe(201);
    // إعادة الدورة الحالية كما كانت: بقية الملفات تعتمد عليها في الأدوار المرتبطة بدورة
    await db.$transaction([
      db.councilTerm.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
      db.councilTerm.update({ where: { id: current.id }, data: { isCurrent: true, endsAt: null } }),
    ]);
  });
});
