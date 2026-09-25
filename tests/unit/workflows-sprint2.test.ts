import { describe, expect, it } from 'vitest';
import { IDEA_TRANSITIONS, ideaTransitionPermission, PUBLIC_IDEA_STATUSES, VOTABLE_IDEA_STATUSES } from '@/lib/ideas/workflow';
import { TASK_TRANSITIONS, taskTransitionPermission } from '@/lib/tasks/workflow';
import type { IdeaStatus, TaskStatus } from '@/lib/generated/prisma/enums';

// Sprint 2 — وحدة: جدولا انتقالات المهمة (AC-06) والفكرة (§5.2)

const TASK_ALLOWED: [TaskStatus, TaskStatus, string][] = [
  ['TODO', 'IN_PROGRESS', 'tasks:update'],
  ['IN_PROGRESS', 'REVIEW', 'tasks:update'],
  ['IN_PROGRESS', 'TODO', 'tasks:update'],
  ['REVIEW', 'IN_PROGRESS', 'tasks:update'],
  ['REVIEW', 'DONE', 'tasks:approve'],
];

describe('انتقالات المهمة — AC-06', () => {
  it.each(TASK_ALLOWED)('%s → %s بـ %s', (from, to, perm) => expect(taskTransitionPermission(from, to)).toBe(perm));

  it('«منجزة» لا تُبلغ إلا بـ tasks:approve ومن «مراجعة» وحدها', () => {
    const toDone = Object.entries(TASK_TRANSITIONS).flatMap(([from, list]) =>
      list.filter((t) => t.to === 'DONE').map((t) => [from, t.permission]),
    );
    expect(toDone).toEqual([['REVIEW', 'tasks:approve']]);
  });

  it('المنجزة نهائية · لا قفز من TODO إلى REVIEW', () => {
    expect(TASK_TRANSITIONS.DONE).toEqual([]);
    expect(taskTransitionPermission('TODO', 'REVIEW')).toBeNull();
    expect(taskTransitionPermission('TODO', 'DONE')).toBeNull();
  });
});

const IDEA_ALLOWED: [IdeaStatus, IdeaStatus, string][] = [
  ['SUBMITTED', 'SCREENING', 'ideas:review'],
  ['SUBMITTED', 'MERGED', 'ideas:merge'],
  ['SCREENING', 'COMMITTEE_REVIEW', 'ideas:review'],
  ['SCREENING', 'MERGED', 'ideas:merge'],
  ['COMMITTEE_REVIEW', 'CHANGES_REQUESTED', 'ideas:review'],
  ['COMMITTEE_REVIEW', 'APPROVED', 'ideas:approve'],
  ['COMMITTEE_REVIEW', 'REJECTED', 'ideas:approve'],
  ['COMMITTEE_REVIEW', 'MERGED', 'ideas:merge'],
  ['CHANGES_REQUESTED', 'COMMITTEE_REVIEW', 'ideas:create'],
];

describe('انتقالات الفكرة — §5.2 · AC-08', () => {
  it.each(IDEA_ALLOWED)('%s → %s بـ %s', (from, to, perm) => expect(ideaTransitionPermission(from, to)).toBe(perm));

  it('الجدول لا يحوي انتقالًا خارج الوثيقة', () => {
    expect(Object.values(IDEA_TRANSITIONS).flat()).toHaveLength(IDEA_ALLOWED.length);
  });

  it('الاعتماد والرفض حصرًا بـ ideas:approve — رئيس اللجنة (ideas:review) لا يحسم', () => {
    for (const [, list] of Object.entries(IDEA_TRANSITIONS)) {
      for (const t of list) if (t.to === 'APPROVED' || t.to === 'REJECTED') expect(t.permission).toBe('ideas:approve');
    }
  });

  it('المحسومة والمدموجة نهائية، ولا تصويت عليها ولا على المُستلمة قبل الفرز', () => {
    for (const s of ['APPROVED', 'REJECTED', 'MERGED'] as IdeaStatus[]) expect(IDEA_TRANSITIONS[s]).toEqual([]);
    for (const s of ['SUBMITTED', 'MERGED', 'APPROVED', 'REJECTED'] as IdeaStatus[]) expect(VOTABLE_IDEA_STATUSES).not.toContain(s);
    expect(PUBLIC_IDEA_STATUSES).not.toContain('SUBMITTED');
    expect(PUBLIC_IDEA_STATUSES).not.toContain('MERGED');
  });
});
