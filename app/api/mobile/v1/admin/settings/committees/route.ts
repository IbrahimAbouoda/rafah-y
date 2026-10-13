import { apiRoute } from '@/lib/api/handler';
import { settingsCommittees } from '@/lib/settings/queries';
import { saveCommittee } from '@/lib/settings/reference';

// اللجان (committees:manage) · POST ينشئ
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await settingsCommittees(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await saveCommittee(user, body)) ?? undefined, status: 201 }));
