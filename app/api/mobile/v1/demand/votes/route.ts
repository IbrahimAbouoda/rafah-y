import { apiRoute } from '@/lib/api/handler';
import { demandVote } from '@/lib/demand/actions';

// تصويت على مجال تدريب (demand:vote) — بلوغ الحد ينشئ مسودة Concept Note واحدة (AC-12)
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await demandVote(user, body)) ?? undefined }));
