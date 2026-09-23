// منح دور من سطر الأوامر — لأول رئيس مجلس أو مدير تقني فقط، حين لا يوجد بعدُ من يملك users:manage_roles.
// بعدها تُدار الأدوار من /admin/settings/users.
//
//   npm run admin:grant -- <email-or-phone> <roleKey> [committeeSlug]
//
// المستخدم يجب أن يكون قد سجّل حسابه من /register أولًا. العملية تُكتب في AuditLog بمصدر "cli".
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

async function main() {
  const [identifier, roleKey, committeeSlug] = process.argv.slice(2);
  if (!identifier || !roleKey) {
    console.error('الاستخدام: npm run admin:grant -- <email-or-phone> <roleKey> [committeeSlug]');
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

    const committee = committeeSlug ? await db.committee.findUnique({ where: { slug: committeeSlug } }) : null;
    if (role.requiresCommittee && !committee) throw new Error(`الدور ${roleKey} يتطلب لجنة: مرّر slug اللجنة.`);

    const term = role.isTermBound ? await db.councilTerm.findFirst({ where: { isCurrent: true } }) : null;
    if (role.isTermBound && !term) throw new Error('لا دورة حالية. شغّل البذرة أو أنشئ دورة أولًا.');

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
          after: { ...assignment, roleKey, startsAt: assignment.startsAt.toISOString(), createdAt: assignment.createdAt.toISOString(), updatedAt: assignment.updatedAt.toISOString() },
        },
      });
    });
    console.log(`✓ مُنح ${user.fullName} دور ${role.nameAr}${committee ? ` في ${committee.nameAr}` : ''}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
