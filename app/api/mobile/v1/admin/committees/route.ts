import { apiRoute, found } from '@/lib/api/handler';
import { committeeList } from '@/lib/committees/queries';

// لجانك (committees:read بنطاق يتجاوز «خاص»)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: found(await committeeList(user), 'نطاق اللجان') }));
