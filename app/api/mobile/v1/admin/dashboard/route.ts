import { apiRoute } from '@/lib/api/handler';
import { complaintTiles } from '@/lib/complaints/queries';

// لوحة المجلس — كل عدّاد بنطاقك، وما لا يحق لك = null
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await complaintTiles(user) }));
