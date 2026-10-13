import { apiRoute, found } from '@/lib/api/handler';
import { complaintFile } from '@/lib/complaints/queries';

// ملف الشكوى الداخلي والإجراءات المتاحة لك عليه — خارج نطاقك 404 (AC-04 ①)
export const GET = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await complaintFile(user, params.id), 'الشكوى') }));
