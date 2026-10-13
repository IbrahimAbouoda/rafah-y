import { apiRoute, found } from '@/lib/api/handler';
import { committeeBoard } from '@/lib/committees/queries';

// كانبان اللجنة — كل بطاقة تحمل canMove/canApprove/canComment من الخادم
export const GET = apiRoute<{ slug: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await committeeBoard(user, params.slug), 'اللجنة') }));
