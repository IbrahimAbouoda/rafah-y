import { apiRoute, pageOf } from '@/lib/api/handler';
import { userList } from '@/lib/settings/queries';

// المستخدمون وأدوارهم — ?q=&page=
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({ data: await userList(user, query.get('q') ?? undefined, pageOf(query)) }));
