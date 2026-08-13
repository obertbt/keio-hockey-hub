import { describe, expect, it } from 'vitest';

import type { MemberGoalRow, SkillCategoryRow } from '@/types/database.types';

import {
  describeActivity,
  groupByCategory,
  sortGoals,
  suggestGoalsForToday,
  summarizeGoals,
  UNSORTED_LABEL,
  type GoalWithActivity,
} from './goals';

/**
 * 中目標の並べ方と数え方（0026）。
 *
 * 守りたいのは
 *   * できたものを畳んで隠さない（積み上がりが見えることが支えになる）
 *   * 大分類が消えても、書いた目標が行方不明にならない
 *   * 毎日の提案は、しばらく触れていないものから出す
 */

function goal(overrides: Partial<MemberGoalRow> = {}): MemberGoalRow {
  return {
    id: 'g1',
    team_id: 't1',
    team_member_id: 'm1',
    skill_category_id: 'c1',
    name: '持ち出しを速くする',
    note: null,
    achieved_at: null,
    sort_order: 0,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function item(overrides: Omit<Partial<GoalWithActivity>, 'goal'> & { goal?: Partial<MemberGoalRow> } = {}) {
  const { goal: goalOverrides, ...rest } = overrides;
  return {
    goal: goal(goalOverrides),
    tagCount: 0,
    lastTaggedAt: null,
    ...rest,
  } satisfies GoalWithActivity;
}

function category(id: string, name: string, sortOrder: number): SkillCategoryRow {
  return {
    id,
    team_id: 't1',
    name,
    description: null,
    sort_order: sortOrder,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('並べ方', () => {
  it('取り組み中のものが先、できたものが後', () => {
    const sorted = sortGoals([
      item({ goal: { id: 'done', achieved_at: '2026-05-01T00:00:00Z' } }),
      item({ goal: { id: 'active' } }),
    ]);
    expect(sorted.map((entry) => entry.goal.id)).toEqual(['active', 'done']);
  });

  it('**できたものを消したり畳んだりしない**', () => {
    // 積み上がったものが見えることが、続ける支えになる（3章の6）
    const sorted = sortGoals([item({ goal: { id: 'done', achieved_at: '2026-05-01T00:00:00Z' } })]);
    expect(sorted).toHaveLength(1);
  });

  it('同じ状態なら、並び順 → 作った順', () => {
    const sorted = sortGoals([
      item({ goal: { id: 'b', sort_order: 1, created_at: '2026-04-01T00:00:00Z' } }),
      item({ goal: { id: 'a', sort_order: 0, created_at: '2026-06-01T00:00:00Z' } }),
      item({ goal: { id: 'c', sort_order: 1, created_at: '2026-03-01T00:00:00Z' } }),
    ]);
    expect(sorted.map((entry) => entry.goal.id)).toEqual(['a', 'c', 'b']);
  });

  it('元の配列を壊さない', () => {
    const input = [item({ goal: { id: 'x' } })];
    sortGoals(input);
    expect(input[0]?.goal.id).toBe('x');
  });
});

describe('大分類ごとのまとめ', () => {
  const categories = [category('c2', '守備', 2), category('c1', '止める・蹴る', 1)];

  it('大分類の並び順に出る', () => {
    const groups = groupByCategory(categories, []);
    expect(groups.map((group) => group.categoryName)).toEqual(['止める・蹴る', '守備']);
  });

  it('目標が無い大分類も出す（ここに書ける、と分かるように）', () => {
    const groups = groupByCategory(categories, []);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.goals).toHaveLength(0);
  });

  it('大分類を決めていない目標は最後にまとめる', () => {
    const groups = groupByCategory(categories, [item({ goal: { id: 'free', skill_category_id: null } })]);
    expect(groups.at(-1)?.categoryName).toBe(UNSORTED_LABEL);
    expect(groups.at(-1)?.goals[0]?.goal.id).toBe('free');
  });

  it('**大分類が消されても、目標は行方不明にならない**', () => {
    const groups = groupByCategory(categories, [item({ goal: { id: 'orphan', skill_category_id: 'gone' } })]);
    expect(groups.at(-1)?.categoryName).toBe(UNSORTED_LABEL);
    expect(groups.at(-1)?.goals[0]?.goal.id).toBe('orphan');
  });

  it('決めていないものが無ければ、その枠は出さない', () => {
    const groups = groupByCategory(categories, [item({ goal: { skill_category_id: 'c1' } })]);
    expect(groups.map((group) => group.categoryName)).not.toContain(UNSORTED_LABEL);
  });
});

describe('数え方', () => {
  it('取り組み中とできたものを分けて数える', () => {
    const summary = summarizeGoals([
      item({ goal: { id: 'a' }, tagCount: 3 }),
      item({ goal: { id: 'b', achieved_at: '2026-05-01T00:00:00Z' }, tagCount: 5 }),
    ]);
    expect(summary.total).toBe(2);
    expect(summary.active).toBe(1);
    expect(summary.achieved).toBe(1);
    expect(summary.totalTags).toBe(8);
  });

  it('書いただけで止まっているものを拾う', () => {
    const summary = summarizeGoals([
      item({ goal: { id: 'a' }, tagCount: 0 }),
      item({ goal: { id: 'b' }, tagCount: 2 }),
    ]);
    expect(summary.untouched).toBe(1);
  });

  it('できたものは「止まっている」に数えない', () => {
    const summary = summarizeGoals([
      item({ goal: { id: 'a', achieved_at: '2026-05-01T00:00:00Z' }, tagCount: 0 }),
    ]);
    expect(summary.untouched).toBe(0);
  });

  it('1つも無くても落ちない', () => {
    expect(summarizeGoals([])).toEqual({
      total: 0,
      active: 0,
      achieved: 0,
      totalTags: 0,
      untouched: 0,
    });
  });
});

describe('今日出す目標', () => {
  it('できたものは出さない', () => {
    const suggested = suggestGoalsForToday([
      item({ goal: { id: 'done', achieved_at: '2026-05-01T00:00:00Z' } }),
      item({ goal: { id: 'active' } }),
    ]);
    expect(suggested.map((entry) => entry.goal.id)).toEqual(['active']);
  });

  it('**一度も触れていないものを、いちばん上に**', () => {
    const suggested = suggestGoalsForToday([
      item({ goal: { id: 'recent' }, lastTaggedAt: '2026-06-01T00:00:00Z' }),
      item({ goal: { id: 'never' }, lastTaggedAt: null }),
    ]);
    expect(suggested[0]?.goal.id).toBe('never');
  });

  it('**よく使うものではなく、しばらく触れていないものを上に**', () => {
    // よく使う順にすると、同じ目標ばかりに寄っていく
    const suggested = suggestGoalsForToday([
      item({ goal: { id: 'yesterday' }, tagCount: 20, lastTaggedAt: '2026-06-10T00:00:00Z' }),
      item({ goal: { id: 'long-ago' }, tagCount: 1, lastTaggedAt: '2026-04-01T00:00:00Z' }),
    ]);
    expect(suggested.map((entry) => entry.goal.id)).toEqual(['long-ago', 'yesterday']);
  });

  it('多すぎると選ぶのが作業になるので、上限で切る', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      item({ goal: { id: `g${index}`, name: `目標${index}` } }),
    );
    expect(suggestGoalsForToday(many)).toHaveLength(8);
    expect(suggestGoalsForToday(many, 3)).toHaveLength(3);
  });
});

describe('積み上がりの言い方', () => {
  it('0回でも黙らない', () => {
    expect(describeActivity(item({ tagCount: 0 }))).toBe('まだ記録に付けていません');
  });

  it('回数を伝える', () => {
    expect(describeActivity(item({ tagCount: 4 }))).toBe('4回');
  });

  it('できたものは、そこまでの回数と一緒に', () => {
    expect(describeActivity(item({ goal: { achieved_at: '2026-05-01T00:00:00Z' }, tagCount: 12 }))).toBe(
      '12回でできるようになりました',
    );
  });

  it('回数が無くても、できたことは伝える', () => {
    expect(describeActivity(item({ goal: { achieved_at: '2026-05-01T00:00:00Z' }, tagCount: 0 }))).toBe(
      'できるようになりました',
    );
  });
});
