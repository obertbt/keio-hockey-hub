import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { PlayerSkillRow, SkillApplicationRow, SkillCategoryRow, SkillRow } from '@/types/database.types';

import { overallProgress, summarizeProgress, type CategoryProgress } from './lib/state';

/**
 * スキルの読み取り（30〜32章）。
 *
 * 見えるかどうかは RLS が決める。
 *   到達状況・申請 … 本人とスタッフ
 *   スキル定義     … チームの全員
 */

/** 中目標と、その下の小目標。子が無ければ、それ自体が到達点。 */
export interface SkillNode {
  skill: SkillRow;
  children: SkillRow[];
}

export interface SkillCategoryNode {
  category: SkillCategoryRow;
  nodes: SkillNode[];
  progress: CategoryProgress;
}

export interface SkillOverview {
  categories: SkillCategoryNode[];
  /** skill_id → 到達状況。 */
  statusBySkill: Map<string, PlayerSkillRow>;
  /** skill_id → いま動いている申請。 */
  openApplicationBySkill: Map<string, SkillApplicationRow>;
  total: CategoryProgress;
}

/**
 * スキル階層と、その人の到達状況をまとめて引く。
 *
 * memberId を省くとログイン中の本人。コーチが選手の状況を見るときに渡す。
 */
export async function getSkillOverview(
  session: AppSession,
  memberId: string = session.teamMemberId,
): Promise<SkillOverview> {
  const supabase = await createClient();

  const [categoryResult, skillResult, playerSkillResult, applicationResult] = await Promise.all([
    supabase
      .from('skill_categories')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('skills')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase.from('player_skills').select('*').eq('team_member_id', memberId).is('deleted_at', null),
    supabase
      .from('skill_applications')
      .select('*')
      .eq('team_member_id', memberId)
      .in('status', ['draft', 'submitted', 'reviewing'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const categories = categoryResult.data ?? [];
  const skills = skillResult.data ?? [];
  const playerSkills = playerSkillResult.data ?? [];

  const progressByCategory = summarizeProgress(skills, playerSkills);

  const childrenByParent = new Map<string, SkillRow[]>();
  for (const skill of skills) {
    if (!skill.parent_id) continue;
    const list = childrenByParent.get(skill.parent_id) ?? [];
    list.push(skill);
    childrenByParent.set(skill.parent_id, list);
  }

  const emptyProgress = (categoryId: string): CategoryProgress => ({
    categoryId,
    total: 0,
    approved: 0,
    inProgress: 0,
    notStarted: 0,
    percent: 0,
  });

  const nodes: SkillCategoryNode[] = categories.map((category) => ({
    category,
    nodes: skills
      .filter((skill) => skill.skill_category_id === category.id && skill.parent_id === null)
      .map((skill) => ({ skill, children: childrenByParent.get(skill.id) ?? [] })),
    progress: progressByCategory.get(category.id) ?? emptyProgress(category.id),
  }));

  // いちばん新しい申請だけを残す（同じスキルに複数の下書きがある場合）
  const openApplicationBySkill = new Map<string, SkillApplicationRow>();
  for (const application of applicationResult.data ?? []) {
    if (!openApplicationBySkill.has(application.skill_id)) {
      openApplicationBySkill.set(application.skill_id, application);
    }
  }

  return {
    categories: nodes,
    statusBySkill: new Map(playerSkills.map((entry) => [entry.skill_id, entry])),
    openApplicationBySkill,
    total: overallProgress(progressByCategory),
  };
}

/**
 * 申請・審査まわりの読み取りは 0026 で消した。
 *
 * 「大分類 → 中目標 → 小目標」の3段階と、小目標ごとの申請・承認をやめ、
 * 「大分類（固定）+ 中目標（各自が書く）」の2段階にしたため。
 * いまここに残っているのは、大分類の管理画面（/admin/skills）で使う分だけ。
 *
 * 表そのもの（skill_applications など）は残してある。
 * 過去のやり取りを消さないため。読み書きする画面はもう無い。
 * 選手が書く目標は src/features/goals にある。
 */
