import { apiRoute } from '@/lib/api/handler';
import { publicCommittees } from '@/lib/committees/queries';

// اللجان النشطة بولايتها (Q15: بلا أسماء أعضاء)
export const GET = apiRoute({ auth: 'none' }, async () => ({ data: await publicCommittees() }));
