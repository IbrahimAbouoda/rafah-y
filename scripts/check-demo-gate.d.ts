// أنواع scripts/check-demo-gate.js للاختبارات (allowJs مطفأ في tsconfig)
export declare const DEMO_TABLES: string[];
export declare const DEMO_COUNT_SQL: string;
export declare function isProduction(env: Record<string, string | undefined>): boolean;
export declare function checkDemoGate(
  env: Record<string, string | undefined>,
  countDemo: (url: string) => Promise<{ table: string; count: number }[]>,
): Promise<{ ok: boolean; message: string }>;
