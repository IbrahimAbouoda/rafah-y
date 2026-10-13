import { apiRoute, merge } from '@/lib/api/handler';
import { setInitiativeStatus } from '@/lib/initiatives/actions';

// انتقال في مسار المبادرة — النشر للرئيس وحده (initiative.approve)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await setInitiativeStatus(user, merge(body, { initiativeId: params.id }))) ?? undefined,
}));
