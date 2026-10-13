import { apiRoute } from '@/lib/api/handler';
import { landingPath, meNavFor, navFor, partnerNavFor } from '@/lib/nav';
import { serializeGrants } from '@/lib/rbac';
import { unreadCount } from '@/lib/shell';

// الجلسة: المستخدم وأدواره ومنحه (لـ can() في التطبيق — إخفاء بصري فقط)، والتنقل كما يبنيه الويب (D34)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({
  data: {
    user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone },
    roles: user.roles,
    grants: serializeGrants(user.grants),
    nav: { admin: navFor(user), partner: partnerNavFor(user), me: meNavFor(user) },
    landingPath: landingPath(user),
    unreadCount: await unreadCount(user.id),
  },
}));
