import { apiRoute } from '@/lib/api/handler';
import { settingsCategories } from '@/lib/settings/queries';
import { saveCategory } from '@/lib/settings/reference';

// تصنيفات الشكاوى (settings:manage) · POST ينشئ
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await settingsCategories(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await saveCategory(user, body)) ?? undefined, status: 201 }));
