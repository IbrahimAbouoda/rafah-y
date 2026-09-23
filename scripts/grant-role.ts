// منح دور من سطر الأوامر — لأول رئيس مجلس أو مدير تقني فقط، حين لا يوجد بعدُ من يملك users:manage_roles.
// بعدها تُدار الأدوار من /admin/settings/users.
//
//   npm run admin:grant -- <email-or-phone> <roleKey> [committeeSlug | --all-committees]
//
// --all-committees: تعيين مستقل في كل لجنة نشطة (للاختبار التقني عبر اللجان — PRD §19.3 D22).
// المستخدم يجب أن يكون قد سجّل حسابه من /register أولًا. كل تعيين يُكتب في AuditLog بمصدر "cli".
// إعادة التشغيل آمنة: التعيين الفعّال الموجود لا يتكرر.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

const ALL_COMMITTEES = '--all-committees';

async function main() {
  const [identifier, roleKey, committeeArg] = process.argv.slice(2);
  if (!identifier || !roleKey) {
    console.error(`الاستخدام: npm run admin:grant -- <email-or-phone> <roleKey> [committeeSlug | ${ALL_COMMITTEES}]`);
    process.exit(2);
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL)');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }], deletedAt: null },
    });
    if (!user) throw new Error(`لا مستخدم بهذا المعرّف: ${identifier}. سجّل الحساب من /register أولًا.`);

    const role = await db.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new Error(`لا دور بالمفتاح ${roleKey}. شغّل npx prisma db seed أولًا.`);

    let committees: { id: string; nameAr: string }[] = [];
    if (committeeArg === ALL_COMMITTEES) {
      committees = await db.committee.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, nameAr: true },
      });
      if (committees.length === 0) throw new Error('لا لجان نشطة. شغّل npx prisma db seed أولًا.');
    } else if (committeeArg) {
      const committee = await db.committee.findUnique({ where: { slug: committeeArg }, select: { id: true, nameAr: true } });
      if (!committee) throw new Error(`لا لجنة بالمعرّف ${committeeArg}.`);
      committees = [committee];
    }
    if (role.requiresCommittee && committees.length === 0) {
      throw new Error(`الدور ${roleKey} يتطلب لجنة: مرّر slug اللجنة أو ${ALL_COMMITTEES}.`);
    }
    if (!role.requiresCommittee && committees.length > 0) throw new Error(`الدور ${roleKey} لا يرتبط بلجنة.`);

    const term = role.isTermBound ? await db.councilTerm.findFirst({ where: { isCurrent: true } }) : null;
    if (role.isTermBound && !term) throw new Error('لا دورة حالية. شغّل البذرة أو أنشئ دورة أولًا.');

    const targets: ({ id: string; nameAr: string } | null)[] = committees.length > 0 ? committees : [null];
    for (const committee of targets) {
      const label = `${role.nameAr}${committee ? ` في ${committee.nameAr}` : ''}`;
      const now = new Date();
      const existing = await db.roleAssignment.findFirst({
        where: {
          userId: user.id,
          roleId: role.id,
          committeeId: committee?.id ?? null,
          revokedAt: null,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          ...(term ? { termId: term.id } : {}),
        },
      });
      if (existing) {
        console.log(`• ${user.fullName} يحمل ${label} بالفعل.`);
        continue;
      }
      await db.$transaction(async (tx) => {
        const assignment = await tx.roleAssignment.create({
          data: { userId: user.id, roleId: role.id, committeeId: committee?.id ?? null, termId: term?.id ?? null },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            actorRoles: ['system:cli'],
            action: 'role.assign',
            entityType: 'RoleAssignment',
            entityId: assignment.id,
            after: {
              ...assignment,
              roleKey,
              startsAt: assignment.startsAt.toISOString(),
              createdAt: assignment.createdAt.toISOString(),
              updatedAt: assignment.updatedAt.toISOString(),
            },
          },
        });
      });
      console.log(`✓ مُنح ${user.fullName} دور ${label}.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
