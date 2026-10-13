import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSpec, renderSpec, SPEC_FILE } from '@/scripts/openapi';

// docs/mobile/openapi.yaml مولَّد من المسارات ومخططات Zod والأمثلة المسجّلة — لا يتأخر عنها.

describe('docs/mobile/openapi.yaml', () => {
  it('مطابق لما تولّده المصادر (npm run api:openapi)', () => {
    expect(readFileSync(SPEC_FILE, 'utf8')).toBe(renderSpec());
  });

  it('لكل عملية مثال استجابة مسجَّل (npm run api:fixtures)', () => {
    const spec = buildSpec() as { info: { description: string } };
    expect(spec.info.description).toMatch(/مسارات بلا مثال استجابة مسجَّل: 0$/);
  });

  it('كل مسار بمعرّف يصرّح بمعامله، وكل عملية كتابة لها جسم طلب من Zod', () => {
    type Op = { parameters?: { name: string; in: string }[]; requestBody?: unknown };
    const spec = buildSpec() as unknown as { paths: Record<string, Record<string, Op>> };
    const noBody = ['/me/notifications/read-all'];
    for (const [p, ops] of Object.entries(spec.paths)) {
      const names = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const [method, op] of Object.entries(ops)) {
        expect(op.parameters?.filter((x) => x.in === 'path').map((x) => x.name) ?? []).toEqual(names);
        if (method !== 'get' && !noBody.includes(p)) expect(op.requestBody, `${method} ${p}`).toBeDefined();
      }
    }
  });
});
