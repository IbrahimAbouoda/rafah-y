import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// قواعد CLAUDE.md «ممنوع» التي يمكن فحصها آليًا
const physicalSpacing = /\b-?(ml|mr|pl|pr|left|right)-/;

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'lib/generated/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${physicalSpacing}]`,
          message: 'خصائص منطقية فقط: ms- me- ps- pe- start- end- (CLAUDE.md · PRD §12)',
        },
        {
          selector: `TemplateElement[value.raw=${physicalSpacing}]`,
          message: 'خصائص منطقية فقط: ms- me- ps- pe- start- end- (CLAUDE.md · PRD §12)',
        },
        {
          selector: "BinaryExpression[operator=/^[!=]==?$/] > MemberExpression[property.name=/^(role|roleKey)$/]",
          message: 'ممنوع مقارنة اسم دور — الصلاحية من can() فقط (PRD §3.1)',
        },
      ],
    },
  },
  {
    files: ['prisma/**', 'scripts/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
];
export default config;
