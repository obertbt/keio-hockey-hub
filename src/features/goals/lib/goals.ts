import type { MemberGoalRow, SkillCategoryRow } from '@/types/database.types';

/**
 * 中目標の並べ方と数え方（0026）。
 *
 * ここは通信もDBも触らない。画面ごとに数え方がずれないよう、1か所に置く。
 *
 * 3段階（大→中→小）と申請・承認をやめた経緯は 0026 の頭に書いてある。
 * ここで扱うのは「本人が書いた中目標」だけ。
 */

/** 目標1つと、その積み上がり。 */
export interface GoalWithActivity {
  goal: MemberGoalRow;
  /** その目標に何回向き合ったか（日報・動画の書き込みに付けた回数）。 */
  tagCount: number;
  /** 最後に向き合った日時。まだなら null。 */
  lastTaggedAt: string | null;
}

/** 大分類ごとのまとまり。大分類を決めていないものは最後に来る。 */
export interface GoalGroup {
  categoryId: string | null;
  categoryName: string;
  goals: GoalWithActivity[];
}

/** 大分類を決めていない目標の置き場所。消さずに、見えるところに残す。 */
export const UNSORTED_LABEL = 'まだ分けていない';

/**
 * 取り組み中のものを先に、できたものを後に。
 *
 * できたものを畳んで隠さない。積み上がったものが見えることが、
 * 続ける支えになる（3章の6）。ただし「次に何をするか」のほうが
 * 毎日必要なので、上に置くのは取り組み中のもの。
 */
export function sortGoals(items: GoalWithActivity[]): GoalWithActivity[] {
  return [...items].sort((left, right) => {
    const leftDone = left.goal.achieved_at !== null;
    const rightDone = right.goal.achieved_at !== null;
    if (leftDone !== rightDone) return leftDone ? 1 : -1;

    if (left.goal.sort_order !== right.goal.sort_order) {
      return left.goal.sort_order - right.goal.sort_order;
    }
    return left.goal.created_at.localeCompare(right.goal.created_at);
  });
}

/**
 * 大分類ごとにまとめる。
 *
 * 大分類は、目標が1つも無くても出す。
 * 「ここに書ける」と分かることが、書き始めるきっかけになる。
 */
export function groupByCategory(categories: SkillCategoryRow[], items: GoalWithActivity[]): GoalGroup[] {
  const groups: GoalGroup[] = categories
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      goals: sortGoals(items.filter((item) => item.goal.skill_category_id === category.id)),
    }));

  // 大分類が消された目標も、ここで拾う。行方不明にしない。
  const knownIds = new Set(categories.map((category) => category.id));
  const unsorted = items.filter(
    (item) => item.goal.skill_category_id === null || !knownIds.has(item.goal.skill_category_id),
  );

  if (unsorted.length > 0) {
    groups.push({ categoryId: null, categoryName: UNSORTED_LABEL, goals: sortGoals(unsorted) });
  }

  return groups;
}

export interface GoalSummary {
  total: number;
  /** まだ「できた」を押していないもの。 */
  active: number;
  achieved: number;
  /** 全部あわせて何回向き合ったか。 */
  totalTags: number;
  /** まだ一度も向き合っていない目標の数。書いただけで止まっているもの。 */
  untouched: number;
}

export function summarizeGoals(items: GoalWithActivity[]): GoalSummary {
  const achieved = items.filter((item) => item.goal.achieved_at !== null).length;

  return {
    total: items.length,
    active: items.length - achieved,
    achieved,
    totalTags: items.reduce((sum, item) => sum + item.tagCount, 0),
    // できたものは、もう向き合わなくていい。数に入れない。
    untouched: items.filter((item) => item.tagCount === 0 && item.goal.achieved_at === null).length,
  };
}

/**
 * 「今日の日報に、どの目標を出すか」。
 *
 * 全部並べると、選ぶのが作業になる。毎日触るものなので、
 * **取り組み中のものだけ**を、しばらく触れていない順に出す。
 *
 * 触れていないものを上に置くのは、忘れていたほうを思い出させるため。
 * よく使うものが上に来ると、同じ目標ばかりに寄っていく。
 */
export function suggestGoalsForToday(items: GoalWithActivity[], limit = 8): GoalWithActivity[] {
  return items
    .filter((item) => item.goal.achieved_at === null)
    .sort((left, right) => {
      if (left.lastTaggedAt === null && right.lastTaggedAt === null) {
        return left.goal.created_at.localeCompare(right.goal.created_at);
      }
      if (left.lastTaggedAt === null) return -1;
      if (right.lastTaggedAt === null) return 1;
      return left.lastTaggedAt.localeCompare(right.lastTaggedAt);
    })
    .slice(0, limit);
}

/** 積み上がりの言い方。0回のときに黙らない。 */
export function describeActivity(item: GoalWithActivity): string {
  if (item.goal.achieved_at !== null) {
    return item.tagCount === 0 ? 'できるようになりました' : `${item.tagCount}回でできるようになりました`;
  }
  if (item.tagCount === 0) return 'まだ記録に付けていません';
  return `${item.tagCount}回`;
}
