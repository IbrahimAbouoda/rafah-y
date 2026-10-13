import { apiRoute } from '@/lib/api/handler';
import { saveOrganization } from '@/lib/organizations/actions';
import { organizationList } from '@/lib/organizations/queries';

// CRM المؤسسات — ?q= · POST ينشئ مؤسسة (organizations:manage)
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({ data: await organizationList(user, query.get('q') ?? undefined) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await saveOrganization(user, body)) ?? undefined, status: 201 }));
