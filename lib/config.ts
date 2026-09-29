// إعدادات نظام ثابتة. ليست فحص صلاحيات: can() وحدها تقرّر من يفعل ماذا.

/** الدور الذي يُمنح لكل حساب جديد يسجّل بنفسه (PRD §2 P1) */
export const SIGNUP_ROLE_KEY = 'youth';

/** لجنة الإعلام التي تُفحص مقابلها صلاحيات media:* (PRD §4.3 · §9) */
export const MEDIA_COMMITTEE_SLUG = 'public-relations-media';

export const isProduction = process.env.NODE_ENV === 'production';

/** لجنة المؤسسات والشراكات: تظهر مسودات Concept Note في مهامها (AC-12) */
export const PARTNERSHIPS_COMMITTEE_SLUG = 'organizations-partnerships';

/** الدور الذي يُمنح لممثل مؤسسة عند ربطه بها (D26) */
export const PARTNER_ROLE_KEY = 'partner';

/** العملات المسموحة (D13 · قيد funding_currency_allowed) */
export const CURRENCIES = ['ILS', 'USD'] as const;

/** البريد الرسمي للمجلس — مرسِل كل الإشعارات والقوالب (PRD §19.3 D19، مؤقت حتى النطاق الدائم Q8) */
export const COUNCIL_EMAIL = 'info.rafahyouth@gmail.com';
/** الاسم الرسمي كما في الشعار (public/logo.png) */
export const COUNCIL_NAME_AR = 'المجلس الشبابي البلدي - رفح';
export const COUNCIL_NAME_EN = 'Municipal Youth Council - Rafah';
export const COUNCIL_SENDER_NAME = `نبض رفح — ${COUNCIL_NAME_AR}`;

/** أساس الروابط في البريد ورسائل المشاركة */
export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** تُحفظ الشكوى 5 سنوات، وتُجهَّل بعد 3 سنوات من إغلاقها (D18) — تُعرض في بند الخصوصية */
export const COMPLAINT_RETENTION = { keepYears: 5, anonymizeAfterClosedYears: 3 } as const;
