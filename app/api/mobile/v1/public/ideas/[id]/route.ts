import { apiRoute, found } from '@/lib/api/handler';
import { publicIdea } from '@/lib/ideas/queries';

// فكرة عامة — المدموجة تعيد kind=merged بالأصلية، وملاحظة المراجعة لمن يملك ideas:read_internal فقط
export const GET = apiRoute<{ id: string }>({ auth: 'optional' }, async ({ user, params }) => ({ data: found(await publicIdea(user, params.id), 'الفكرة') }));
