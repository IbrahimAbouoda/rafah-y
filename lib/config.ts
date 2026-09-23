// إعدادات نظام ثابتة. ليست فحص صلاحيات: can() وحدها تقرّر من يفعل ماذا.

/** الدور الذي يُمنح لكل حساب جديد يسجّل بنفسه (PRD §2 P1) */
export const SIGNUP_ROLE_KEY = 'youth';

/** لجنة الإعلام التي تُفحص مقابلها صلاحيات media:* (PRD §4.3 · §9) */
export const MEDIA_COMMITTEE_SLUG = 'public-relations-media';

export const isProduction = process.env.NODE_ENV === 'production';
