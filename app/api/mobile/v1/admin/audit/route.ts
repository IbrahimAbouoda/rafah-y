import { apiRoute, pageOf } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit-log';

// سجل التدقيق (audit:read) — ?action=&actor=&entity=&from=&to=&page=
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({
  data: await auditLog(
    user,
    {
      action: query.get('action') ?? undefined,
      actor: query.get('actor') ?? undefined,
      entity: query.get('entity') ?? undefined,
      from: query.get('from') ?? undefined,
      to: query.get('to') ?? undefined,
    },
    pageOf(query, 30),
  ),
}));
