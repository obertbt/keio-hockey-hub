import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { GoalTagRow, MemberGoalRow, SkillCategoryRow } from '@/types/database.types';

import { groupByCategory, summarizeGoals, type GoalGroup, type GoalWithActivity } from './lib/goals';

/**
 * 中目標とタグの読み取り（0026）。
 *
 * 見えるかどうかは RLS が決める。
 *   中目標 … 本人とスタッフ。他の選手には見えない
 *   タグ   … その目標が見える人
 */

export interface GoalOverview {
  categories: SkillCategoryRow[];
  items: GoalWithActivity[];
  groups: GoalGroup[];
  summary: ReturnType<typeof summarizeGoals>;
}

/**
 * その人の中目標を、積み上がりと一緒に。
 *
 * memberId を省くとログイン中の本人。コーチが選手のぶんを見るときに渡す。
 */
export async function getGoalOverview(
  session: AppSession,
  memberId: string = session.teamMemberId,
): Promise<GoalOverview> {
  const supabase = await createClient();

  const [categoryResult, goalResult, activityResult] = await Promise.all([
    supabase
      .from('skill_categories')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('member_goals')
      .select('*')
      .eq('team_member_id', memberId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    // 数え方は DB 側に置いてある。画面ごとにずれないように。
    supabase.rpc('member_goal_activity', { p_team_member_id: memberId }),
  ]);

  const activityByGoal = new Map(
    (activityResult.data ?? []).map((row) => [
      row.member_goal_id,
      { tagCount: row.tag_count, lastTaggedAt: row.last_tagged_at },
    ]),
  );

  const items: GoalWithActivity[] = (goalResult.data ?? []).map((goal) => {
    const activity = activityByGoal.get(goal.id);
    return {
      goal,
      tagCount: activity?.tagCount ?? 0,
      lastTaggedAt: activity?.lastTaggedAt ?? null,
    };
  });

  const categories = categoryResult.data ?? [];

  return {
    categories,
    items,
    groups: groupByCategory(categories, items),
    summary: summarizeGoals(items),
  };
}

/** 目標1つ。直す画面で使う。 */
export async function getGoal(session: AppSession, goalId: string): Promise<MemberGoalRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('member_goals')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', goalId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

/**
 * 日報や動画の書き込みに、いま付いている目標。
 *
 * 見えない目標のタグは、そもそも返らない（RLS がそのまま効く）。
 */
export async function listTagsForReports(reportIds: string[]): Promise<Map<string, TaggedGoal[]>> {
  return listTags('daily_report_id', reportIds);
}

export async function listTagsForComments(commentIds: string[]): Promise<Map<string, TaggedGoal[]>> {
  return listTags('video_comment_id', commentIds);
}

export interface TaggedGoal {
  tagId: string;
  goalId: string;
  name: string;
}

async function listTags(
  column: 'daily_report_id' | 'video_comment_id',
  targetIds: string[],
): Promise<Map<string, TaggedGoal[]>> {
  const result = new Map<string, TaggedGoal[]>();
  const unique = [...new Set(targetIds)];
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data: tags } = await supabase.from('goal_tags').select('*').in(column, unique);

  const rows = tags ?? [];
  if (rows.length === 0) return result;

  const { data: goals } = await supabase
    .from('member_goals')
    .select('id, name')
    .in('id', [...new Set(rows.map((row) => row.member_goal_id))]);

  const nameByGoal = new Map((goals ?? []).map((goal) => [goal.id, goal.name]));

  for (const row of rows) {
    const targetId = row[column];
    if (targetId === null) continue;

    // 名前が引けないものは、目標が見えていないということ。並べない。
    const name = nameByGoal.get(row.member_goal_id);
    if (name === undefined) continue;

    const list = result.get(targetId) ?? [];
    list.push({ tagId: row.id, goalId: row.member_goal_id, name });
    result.set(targetId, list);
  }

  return result;
}

/**
 * その目標に付けた記録の一覧。
 *
 * 「この目標に、いつ何を書いたか」を並べる。
 * 承認の代わりに、これが積み上がりの中身になる。
 */
export interface GoalTrace {
  tag: GoalTagRow;
  /** 日報なら日付、動画なら題名。 */
  label: string;
  href: string;
  body: string | null;
}

export async function listGoalTrace(goalId: string, limit = 30): Promise<GoalTrace[]> {
  const supabase = await createClient();

  const { data: tags } = await supabase
    .from('goal_tags')
    .select('*')
    .eq('member_goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = tags ?? [];
  if (rows.length === 0) return [];

  const reportIds = rows.map((row) => row.daily_report_id).filter((value): value is string => value !== null);
  const commentIds = rows
    .map((row) => row.video_comment_id)
    .filter((value): value is string => value !== null);

  const [reportResult, commentResult] = await Promise.all([
    reportIds.length > 0
      ? supabase.from('daily_reports').select('id, report_date, what_happened').in('id', reportIds)
      : Promise.resolve({ data: [] }),
    commentIds.length > 0
      ? supabase.from('video_comments').select('id, video_id, body, at_seconds').in('id', commentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const reportById = new Map((reportResult.data ?? []).map((row) => [row.id, row]));
  const commentById = new Map((commentResult.data ?? []).map((row) => [row.id, row]));

  const traces: GoalTrace[] = [];

  for (const tag of rows) {
    if (tag.daily_report_id !== null) {
      const report = reportById.get(tag.daily_report_id);
      // 消された・見えなくなったものは並べない
      if (!report) continue;
      traces.push({
        tag,
        label: report.report_date,
        href: `/report/${report.id}`,
        body: report.what_happened,
      });
      continue;
    }

    if (tag.video_comment_id !== null) {
      const comment = commentById.get(tag.video_comment_id);
      if (!comment) continue;
      traces.push({
        tag,
        label: '動画への書き込み',
        href:
          comment.at_seconds === null
            ? `/videos/${comment.video_id}`
            : `/videos/${comment.video_id}?t=${Math.floor(comment.at_seconds)}`,
        body: comment.body,
      });
    }
  }

  return traces;
}
