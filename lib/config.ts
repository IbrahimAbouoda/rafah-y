// إعدادات نظام ثابتة. ليست فحص صلاحيات: can() وحدها تقرّر من يفعل ماذا.

/** الدور الذي يُمنح لكل حساب جديد يسجّل بنفسه (PRD §2 P1) */
export const SIGNUP_ROLE_KEY = 'youth';

/** لجنة الإعلام التي تُفحص مقابلها صلاحيات media:* (PRD §4.3 · §9) */
export const MEDIA_COMMITTEE_SLUG = 'public-relations-media';

export const isProduction = process.env.NODE_ENV === 'production';

/** البريد الرسمي للمجلس — مرسِل كل الإشعارات والقوالب (PRD §19.3 D19، مؤقت حتى النطاق الدائم Q8) */
export const COUNCIL_EMAIL = 'info.rafahyouth@gmail.com';
export const COUNCIL_SENDER_NAME = 'نبض رفح — المجلس البلدي الشبابي';

/** أساس الروابط في البريد ورسائل المشاركة */
export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** تُحفظ الشكوى 5 سنوات، وتُجهَّل بعد 3 سنوات من إغلاقها (D18) — تُعرض في بند الخصوصية */
export const COMPLAINT_RETENTION = { keepYears: 5, anonymizeAfterClosedYears: 3 } as const;
