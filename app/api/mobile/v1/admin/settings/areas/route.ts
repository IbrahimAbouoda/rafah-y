import { apiRoute } from '@/lib/api/handler';
import { settingsAreas } from '@/lib/settings/queries';
import { saveArea } from '@/lib/settings/reference';

// المناطق والأحياء (settings:manage) · POST ينشئ
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await settingsAreas(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await saveArea(user, body)) ?? undefined, status: 201 }));
