import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as decide } from '@/app/api/mobile/v1/admin/ideas/[id]/decide/route';
import { POST as review } from '@/app/api/mobile/v1/admin/ideas/[id]/review/route';
import { GET as reviewFile } from '@/app/api/mobile/v1/admin/ideas/[id]/route';
import { GET as reviewList } from '@/app/api/mobile/v1/admin/ideas/route';
import { POST as vote } from '@/app/api/mobile/v1/ideas/[id]/vote/route';
import { PATCH as revise } from '@/app/api/mobile/v1/me/ideas/[id]/route';
import { GET as myIdeas, POST as submit } from '@/app/api/mobile/v1/me/ideas/route';
import { GET as publicDemand } from '@/app/api/mobile/v1/public/demand/route';
import { GET as publicIdea } from '@/app/api/mobile/v1/public/ideas/[id]/route';
import { GET as publicIdeas } from '@/app/api/mobile/v1/public/ideas/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { actAs, committeeId, createUser, freshIp } from '../../support/factories';

// واجهة الجوّال — الأفكار والطلب (AC-07 · AC-08 · AC-12)

type Submitted = { id: string; reference: string; duplicate: boolean };

const idea = (overrides: Record<string, unknown> = {}) => ({
  clientDraftId: randomUUID(),
  title: 'مساحة دراسة مسائية للطلاب',
  problem: 'لا يوجد مكان هادئ ومضاء للدراسة مساءً في الحي، والكهرباء تنقطع في البيوت.',
  solution: 'تجهيز قاعة في المركز الشبابي بإنارة شمسية ومقاعد، وفتحها من السادسة حتى العاشرة.',
  ...overrides,
});

async function submitted() {
  const youth = await createUser(['youth'], 'شاب');
  await actAs(youth.id);
  const res = await call<Submitted>(submit, { body: idea() });
  expect(res.status).toBe(201);
  return { youth, ...res.data };
}

async function screened() {
  const s = await submitted();
  const president = await createUser(['council_president']);
  await actAs(president.id);
  expect((await call(review, { params: { id: s.id }, body: { toStatus: 'SCREENING' } })).status).toBe(200);
  return { ...s, president };
}

beforeEach(() => {
  freshIp();
});

describe('/me/ideas', () => {
  it('201 برقم RF-IDA، وإعادة نفس المسودة تعيد الفكرة نفسها (§7)', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const body = idea();
    const a = await call<Submitted>(submit, { body });
    const b = await call<Submitted>(submit, { body });
    expect(a.data.reference).toMatch(/^RF-IDA-\d{4}-\d{6}$/);
    expect(b.data.id).toBe(a.data.id);
    expect(await db.idea.count({ where: { clientDraftId: body.clientDraftId } })).toBe(1);
    const mine = await call<{ id: string }[]>(myIdeas);
    expect(mine.data.map((i) => i.id)).toEqual([a.data.id]);
  });

  it('401 بلا رمز · 403 بلا ideas:create', async () => {
    await actAs(null);
    expect((await call(submit, { auth: false, body: idea() })).status).toBe(401);
    const nobody = await createUser([]);
    await actAs(nobody.id);
    expect((await call(submit, { body: idea() })).status).toBe(403);
  });

  it('التعديل لصاحبها فقط وبعد طلب التعديل', async () => {
    const s = await screened();
    const legal = await committeeId('legal-affairs');
    await call(review, { params: { id: s.id }, body: { toStatus: 'COMMITTEE_REVIEW', committeeId: legal } });
    expect(
      (await call(review, { params: { id: s.id }, body: { toStatus: 'CHANGES_REQUESTED', note: 'أضف تقدير الكلفة والمكان المقترح.' } }))
        .status,
    ).toBe(200);
    const edit = { title: 'مساحة دراسة مسائية — معدّلة', problem: idea().problem, solution: idea().solution, estimatedCost: '1500' };

    const other = await createUser(['youth']);
    await actAs(other.id);
    expect((await call(revise, { method: 'PATCH', params: { id: s.id }, body: edit })).status).toBeGreaterThanOrEqual(403);

    await actAs(s.youth.id);
    const ok = await call(revise, { method: 'PATCH', params: { id: s.id }, body: edit });
    expect(ok.error).toBeUndefined();
    expect(ok.status).toBe(200);
  });
});

describe('/public/ideas', () => {
  it('المُستلمة قبل الفرز لا تظهر للعامة، وبعد الفرز تظهر بلا رمز', async () => {
    const s = await submitted();
    await actAs(null);
    expect((await call(publicIdea, { auth: false, params: { id: s.id } })).status).toBe(404);

    const president = await createUser(['council_president']);
    await actAs(president.id);
    await call(review, { params: { id: s.id }, body: { toStatus: 'SCREENING' } });

    await actAs(null);
    const res = await call<{ kind: string; voteMode: string; idea: { reviewNote: string | null } }>(publicIdea, {
      auth: false,
      params: { id: s.id },
    });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ kind: 'idea', voteMode: 'login' });
    const list = await call<{ items: { id: string }[] }>(publicIdeas, { auth: false, query: { sort: 'new' } });
    expect(list.data.items.some((i) => i.id === s.id)).toBe(true);
  });

  it('ملاحظة المراجعة الداخلية لا تصل العامة', async () => {
    const s = await submitted();
    const president = await createUser(['council_president']);
    await actAs(president.id);
    await call(review, { params: { id: s.id }, body: { toStatus: 'SCREENING', note: 'ملاحظة داخلية للمراجعين فقط' } });
    expect((await db.idea.findUniqueOrThrow({ where: { id: s.id } })).reviewNote).toBeTruthy();

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const res = await call<{ idea: { reviewNote: string | null }; internal: boolean }>(publicIdea, { params: { id: s.id } });
    expect(res.data.internal).toBe(false);
    expect(res.data.idea.reviewNote).toBeNull();
  });

  it('التصويت: صوت واحد لكل حساب — الإعادة لا تضيف صوتًا', async () => {
    const s = await screened();
    const voter = await createUser(['youth']);
    await actAs(voter.id);
    expect((await call(vote, { params: { id: s.id }, body: {} })).status).toBe(200);
    const again = await call(vote, { params: { id: s.id }, body: {} });
    expect(again.message).toMatch(/من قبل/);
    const res = await call<{ voteMode: string; idea: { voteCount: number } }>(publicIdea, { params: { id: s.id } });
    expect(res.data).toMatchObject({ voteMode: 'voted', idea: { voteCount: 1 } });
  });
});

describe('/admin/ideas — النطاق والقرار (AC-08)', () => {
  it('رئيس لجنة أخرى لا يرى الفكرة · الشاب 403 · الرئيس يعتمد', async () => {
    const s = await screened();
    const legal = await committeeId('legal-affairs');
    expect(
      (await call(review, { params: { id: s.id }, body: { toStatus: 'COMMITTEE_REVIEW', committeeId: legal } })).status,
    ).toBe(200);

    const otherHead = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(otherHead.id);
    expect((await call(reviewFile, { params: { id: s.id } })).status).toBe(404);
    const list = await call<{ items: { id: string }[] }>(reviewList);
    expect(list.data.items.some((i) => i.id === s.id)).toBe(false);

    await actAs(s.youth.id);
    expect((await call(reviewList)).status).toBe(403);

    await actAs(s.president.id);
    const file = await call<{ actions: { decide: boolean } }>(reviewFile, { params: { id: s.id } });
    expect(file.data.actions.decide).toBe(true);
    expect((await call(decide, { params: { id: s.id }, body: { decision: 'APPROVED' } })).status).toBe(200);
    expect((await db.idea.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('APPROVED');
  });

  it('الرفض بلا سبب ← 422 برسالة الحقل', async () => {
    const s = await screened();
    const res = await call(decide, { params: { id: s.id }, body: { decision: 'REJECTED' } });
    expect(res.status).toBe(422);
    expect(res.error?.field_errors?.note?.[0]).toMatch(/سبب الرفض/);
  });
});

describe('/public/demand', () => {
  it('الزائر: وضع login · الشاب: can', async () => {
    await actAs(null);
    expect((await call<{ mode: string }>(publicDemand, { auth: false })).data.mode).toBe('login');
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call<{ mode: string }>(publicDemand)).data.mode).toBe('can');
  });
});
