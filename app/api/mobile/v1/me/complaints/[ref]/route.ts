import { apiRoute, found } from '@/lib/api/handler';
import { myComplaint } from '@/lib/complaints/queries';

// شكوى من «شكاواي» بأحداثها العامة — شكوى غيره 404
export const GET = apiRoute<{ ref: string }>({ auth: 'required' }, async ({ user, params }) => ({
  data: found(await myComplaint(user, decodeURIComponent(params.ref)), 'الشكوى'),
}));
