import { apiRoute } from '@/lib/api/handler';
import { APP_NAME_AR, APP_TAGLINE_AR, COUNCIL_EMAIL, COUNCIL_SENDER_NAME, CURRENCIES } from '@/lib/config';
import { activeCommittees, complaintFormOptions } from '@/lib/reference';

// ثوابت المنصة وجداولها المرجعية — الجوّال لا يثبّت شيئًا منها في الواجهة
export const GET = apiRoute({ auth: 'none' }, async () => {
  const [{ categories, areas }, committees] = await Promise.all([complaintFormOptions(), activeCommittees()]);
  return {
    data: {
      appNameAr: APP_NAME_AR,
      appTaglineAr: APP_TAGLINE_AR,
      councilNameAr: COUNCIL_SENDER_NAME,
      councilEmail: COUNCIL_EMAIL,
      currencies: CURRENCIES,
      complaintCategories: categories,
      areas,
      committees,
    },
  };
});
