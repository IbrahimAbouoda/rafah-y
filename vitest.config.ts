import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(import.meta.dirname);
const alias = {
  '@': root,
  // server-only يرمي خطأً خارج شرط react-server؛ الاختبارات تعمل في Node مباشرة
  'server-only': path.join(root, 'tests/support/empty.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/support/global-setup.ts'],
          setupFiles: ['tests/support/integration-setup.ts'],
          // قاعدة واحدة مشتركة: الملفات تعمل تباعًا
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
