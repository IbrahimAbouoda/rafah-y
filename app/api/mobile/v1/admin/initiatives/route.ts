import { apiRoute } from '@/lib/api/handler';
import { saveInitiative } from '@/lib/initiatives/actions';
import { conceptNotes, demandAdmin, initiativeAdminList, initiativeTabsFor, requireTab } from '@/lib/initiatives/admin';

// تبويبات /admin/initiatives — ?tab=list|demand|notes، كل تبويب بصلاحيته (D30). POST ينشئ مبادرة (initiatives:create)
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => {
  const tab = query.get('tab') ?? 'list';
  const tabs = initiativeTabsFor(user).map((t) => ({ key: t.key, label: t.label }));
  if (tab === 'demand') {
    requireTab(user, 'demand');
    return { data: { tabs, tab, demand: await demandAdmin(user) } };
  }
  if (tab === 'notes') {
    requireTab(user, 'notes');
    return { data: { tabs, tab, notes: await conceptNotes(user) } };
  }
  requireTab(user, 'list');
  return { data: { tabs, tab: 'list', list: await initiativeAdminList(user) } };
});
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await saveInitiative(user, body)) ?? undefined, status: 201 }));
