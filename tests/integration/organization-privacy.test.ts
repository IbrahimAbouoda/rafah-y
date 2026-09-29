import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { organizationProfile } from '@/lib/organizations';
import { committeeId, createUser, session } from '../support/factories';

// docs/code-and-security-audit.md — M-1 (§3.4: البلدية بلا بيانات شخصية) · M-2 (العروض بنطاق offers:read)

async function orgWithTwoCommitteeOffers() {
  const rep = await createUser([], 'ممثل خصوصية');
  const org = await db.organization.create({
    data: { name: `مؤسسة خصوصية ${Date.now()}`, type: 'LOCAL_NGO', members: { create: { userId: rep.id } } },
  });
  const creator = await createUser();
  const initiative = async (slug: string) =>
    db.initiative.create({
      data: {
        slug: `privacy-${slug}-${Date.now()}`,
        title: `مبادرة ${slug}`,
        status: 'PUBLISHED',
        committeeId: await committeeId(slug),
        createdById: creator.id,
      },
    });
  const [sports, health] = [await initiative('sports-arts'), await initiative('health-affairs')];
  for (const i of [sports, health]) {
    await db.supportOffer.create({ data: { initiativeId: i.id, organizationId: org.id, submittedById: rep.id, types: ['VENUE'] } });
  }
  return { rep, org, sports, health };
}

describe('ملف المؤسسة — M-1 · M-2', () => {
  it('M-1: مراقب البلدية وعضو اللجنة يريان اسم الممثل بلا بريده', async () => {
    const { rep, org } = await orgWithTwoCommitteeOffers();
    for (const viewer of [await createUser(['municipality_observer']), await createUser([{ key: 'committee_member', committee: 'sports-arts' }])]) {
      const { org: seen, manage } = await organizationProfile(db, await session(viewer.id), org.id);
      expect(manage).toBe(false);
      expect(seen?.members).toHaveLength(1);
      expect(seen?.members[0]?.user.fullName).toBe(rep.fullName);
      expect(seen?.members[0]?.user).not.toHaveProperty('email');
      expect(JSON.stringify(seen)).not.toContain(rep.email!);
    }
  });

  it('M-1: من يملك organizations:manage (أمين السر) يرى البريد ليربط ويفكّ', async () => {
    const { rep, org } = await orgWithTwoCommitteeOffers();
    const { org: seen, manage } = await organizationProfile(db, await session((await createUser(['secretary'])).id), org.id);
    expect(manage).toBe(true);
    expect(seen?.members[0]?.user.email).toBe(rep.email);
  });

  it('M-2: رئيس اللجنة يرى عروض مبادرات لجنته فقط، والرئيس يرى الكل', async () => {
    const { org, sports } = await orgWithTwoCommitteeOffers();
    const head = await createUser([{ key: 'committee_head', committee: 'sports-arts' }]);
    const scoped = await organizationProfile(db, await session(head.id), org.id);
    expect(scoped.readOffers).toBe(true);
    expect(scoped.org?.offers.map((o) => o.initiative.id)).toEqual([sports.id]);

    const president = await createUser(['council_president']);
    expect((await organizationProfile(db, await session(president.id), org.id)).org?.offers).toHaveLength(2);
  });

  it('M-2: بلا offers:read لا تُقرأ العروض أصلًا', async () => {
    const { org } = await orgWithTwoCommitteeOffers();
    // عضو اللجنة يملك organizations:read ولا يملك offers:read (§3.3)
    const member = await createUser([{ key: 'committee_member', committee: 'sports-arts' }]);
    const seen = await organizationProfile(db, await session(member.id), org.id);
    expect(seen.readOffers).toBe(false);
    expect(seen.org?.offers).toEqual([]);
  });
});
