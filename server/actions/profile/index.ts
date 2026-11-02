'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { invalid } from '@/lib/errors';
import { ConsentSchema, ProfileSchema } from '@/lib/validation/opportunities';

// الملف الشخصي — PRD §4.4 · §6.8. profiles:update بنطاق «خاص»: المستخدم يعدّل ملفه وحده،
// فالسجل المستهدف هو دائمًا user.id — لا معرّف يأتي من النموذج.

/** مهارات النموذج: خانة skill:<id> قيمتها المستوى، والفارغة = ليست من مهاراتي */
function skillsFrom(form: FormData) {
  const out: { skillId: string; level: string }[] = [];
  for (const [k, v] of form.entries()) {
    if (k.startsWith('skill:') && typeof v === 'string' && v) out.push({ skillId: k.slice(6), level: v });
  }
  return out;
}

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'profiles:update');
    const data = ProfileSchema.parse({ ...formToObject(form), skills: skillsFrom(form) });
    requirePermission(user, 'profiles:update', { ownerId: user.id });

    const skillIds = data.skills.map((s) => s.skillId);
    if (skillIds.length && (await db.skill.count({ where: { id: { in: skillIds } } })) !== skillIds.length) {
      throw invalid('بعض المهارات لم تعد موجودة. حدّث الصفحة واختر من جديد.');
    }
    if (data.areaId && !(await db.area.findUnique({ where: { id: data.areaId }, select: { id: true } }))) {
      throw invalid('المنطقة غير متاحة. اختر من القائمة.', { areaId: ['اختر المنطقة من القائمة.'] });
    }

    const fields = {
      birthYear: data.birthYear ?? null,
      areaId: data.areaId ?? null,
      educationLevel: data.educationLevel ?? null,
      languages: data.languages,
      interests: data.interests,
      jobSeeking: data.jobSeeking,
    };
    await db.$transaction(async (tx) => {
      await tx.youthProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...fields }, update: fields });
      await tx.youthSkill.deleteMany({ where: { userId: user.id, skillId: { notIn: skillIds } } });
      for (const s of data.skills) {
        await tx.youthSkill.upsert({
          where: { userId_skillId: { userId: user.id, skillId: s.skillId } },
          create: { userId: user.id, skillId: s.skillId, level: s.level },
          update: { level: s.level },
        });
      }
    });
    revalidatePath('/me/profile');
    return 'حُفظ ملفك.';
  });
}

/**
 * الموافقة العامة على مشاركة الملف (§6.8): صريحة ومؤرّخة وقابلة للسحب في أي وقت.
 * السحب يوقف الظهور المستقبلي، ولا يمسّ طلبات الفرص السابقة — لكل منها موافقته (shareProfile).
 */
export async function setConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'profiles:update');
    const { shareWithPartners } = ConsentSchema.parse(formToObject(form));
    requirePermission(user, 'profiles:update', { ownerId: user.id });

    const now = new Date();
    await db.youthProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, shareWithPartners, consentUpdatedAt: now },
      update: { shareWithPartners, consentUpdatedAt: now },
    });
    revalidatePath('/me/profile');
    return shareWithPartners
      ? 'وافقت على مشاركة ملفك مع المؤسسات الشريكة. يمكنك سحب الموافقة في أي وقت.'
      : 'سُحبت موافقتك. لن يظهر ملفك للمؤسسات من الآن، وتبقى طلباتك السابقة كما قدّمتها بموافقتك.';
  });
}
