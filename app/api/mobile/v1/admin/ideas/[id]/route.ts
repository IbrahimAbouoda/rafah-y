import { apiRoute, found } from '@/lib/api/handler';
import { ideaReviewFile } from '@/lib/ideas/queries';

// ملف الفكرة والإجراءات المتاحة — خارج نطاقك 404
export const GET = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await ideaReviewFile(user, params.id), 'الفكرة') }));
