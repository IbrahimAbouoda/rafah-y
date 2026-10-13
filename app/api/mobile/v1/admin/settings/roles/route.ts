import { apiRoute } from '@/lib/api/handler';
import { rolesMatrix } from '@/lib/settings/queries';

// مصفوفة الأدوار والصلاحيات — قراءة فقط
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await rolesMatrix(user) }));
