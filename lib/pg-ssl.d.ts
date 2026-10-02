// أنواع lib/pg-ssl.js (allowJs مطفأ في tsconfig)
export declare function pgConnection(
  url: string,
  env?: Record<string, string | undefined>,
): { connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } };
