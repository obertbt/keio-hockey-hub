'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { goalTagSchema, memberGoalSchema, mergeGoalSchema } from './schemas';
import { applyGoalTags } from './tags';

/**
 * 中目標とタグの書き込み（0026）。
 *
 * 守ること:
 *   * 対象はサーバが決める（画面から team_member_id を受け取らない）
 *   * **本人以外は触れない。** コーチも直せない。
 *     RLS でも同じ条件で守っているが、断る理由を伝えるためここでも見る
 *   * 承認の手続きは無い。「できた」を押すのは本人
 */

export interface GoalActionState {
  error?: string;
  success?: string;
  /** 作った目標の id。画面がその場で続きを出すために使う。 */
  createdGoalId?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function textList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string' && value !== '');
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** 目標を1つ書く。 */
export async function createGoal(_prevState: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const session = await requireSession();

  const parsed = memberGoalSchema.safeParse({
    name: text(formData, 'name') ?? '',
    note: text(formData, 'note'),
    skill_category_id: text(formData, 'skill_category_id'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 末尾に置く。並べ替えの手間を最初から掛けさせない。
  const { data: last } = await supabase
    .from('member_goals')
    .select('sort_order')
    .eq('team_member_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: goal, error } = await supabase
    .from('member_goals')
    .insert({
      team_id: session.teamId,
      // 誰の目標かはサーバが決める。画面から受け取らない。
      team_member_id: session.teamMemberId,
      skill_category_id: input.skill_category_id,
      name: input.name,
      note: input.note,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single();

  if (error) {
    // 一意制約は「同じ名前をもう書いてある」。そのまま出すと読めない。
    if (error.code === '23505') {
      return { error: '同じ名前の目標がすでにあります。少し言い方を変えてみてください。' };
    }
    return { error: `保存できませんでした: ${error.message}` };
  }

  revalidatePath('/goals');
  revalidatePath('/today');
  return { success: '目標を書きました。', createdGoalId: goal?.id };
}

/** 目標を直す。名前も、大分類も、あとから自由に変えられる。 */
export async function updateGoal(_prevState: GoalActionState, formData: FormData): Promise<GoalActionState> {
  await requireSession();

  const goalId = text(formData, 'goal_id') ?? '';
  if (goalId === '') return { error: '対象の目標が分かりません。' };

  const parsed = memberGoalSchema.safeParse({
    name: text(formData, 'name') ?? '',
    note: text(formData, 'note'),
    skill_category_id: text(formData, 'skill_category_id'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('member_goals')
    .update({
      name: input.name,
      note: input.note,
      skill_category_id: input.skill_category_id,
    })
    .eq('id', goalId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { error: '同じ名前の目標がすでにあります。' };
    }
    return { error: `直せませんでした: ${error.message}` };
  }
  // RLS で弾かれると0件になる。理由を伝える。
  if (!data) return { error: '自分の目標だけ直せます。' };

  revalidatePath('/goals');
  revalidatePath(`/goals/${goalId}`);
  return { success: '直しました。' };
}

/**
 * 「できるようになった」を押す・取り消す。
 *
 * コーチの承認は要らない。**押すのは本人**。
 * 人に認めてもらう手続きが要ると、出すのが怖くなる。
 */
export async function toggleGoalAchieved(
  _prevState: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  await requireSession();

  const goalId = text(formData, 'goal_id') ?? '';
  if (goalId === '') return { error: '対象の目標が分かりません。' };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('member_goals')
    .select('achieved_at')
    .eq('id', goalId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!current) return { error: 'その目標は見つかりません。' };

  const next = current.achieved_at === null ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('member_goals')
    .update({ achieved_at: next })
    .eq('id', goalId)
    .select('id')
    .maybeSingle();

  if (error) return { error: `変えられませんでした: ${error.message}` };
  if (!data) return { error: '自分の目標だけ変えられます。' };

  revalidatePath('/goals');
  revalidatePath(`/goals/${goalId}`);
  revalidatePath('/today');

  return {
    success:
      next === null ? 'もう一度、取り組み中にしました。' : 'できるようになりました。おめでとうございます。',
  };
}

/** 目標を消す。付いていたタグも一緒に外れる。 */
export async function deleteGoal(_prevState: GoalActionState, formData: FormData): Promise<GoalActionState> {
  await requireSession();

  const goalId = text(formData, 'goal_id') ?? '';
  if (goalId === '') return { error: '対象の目標が分かりません。' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('soft_delete_member_goal', { p_goal_id: goalId });

  if (error) return { error: `消せませんでした: ${error.message}` };

  revalidatePath('/goals');
  revalidatePath('/today');
  return { success: '消しました。' };
}

/**
 * 2つの目標をまとめる（振り替え）。
 *
 * 「持ち出し」と「持ち出しを速く」を別々に作ってしまった、が必ず起きる。
 * 片方を消すと積み上がりが失われるので、移してから畳む。
 */
export async function mergeGoals(_prevState: GoalActionState, formData: FormData): Promise<GoalActionState> {
  await requireSession();

  const parsed = mergeGoalSchema.safeParse({
    from_goal_id: text(formData, 'from_goal_id') ?? '',
    into_goal_id: text(formData, 'into_goal_id') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('merge_member_goal', {
    p_from_goal_id: parsed.data.from_goal_id,
    p_into_goal_id: parsed.data.into_goal_id,
  });

  if (error) return { error: `まとめられませんでした: ${error.message}` };

  revalidatePath('/goals');
  return { success: `まとめました。${data ?? 0}件の記録を移しました。` };
}

/**
 * 記録に目標を付け直す。
 *
 * 「足す」ではなく「いまの状態に合わせる」。
 * 選び直しても、外し忘れが残らない。
 */
export async function setGoalTags(_prevState: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const session = await requireSession();

  const parsed = goalTagSchema.safeParse({
    goal_ids: textList(formData, 'goal_ids'),
    target_type: text(formData, 'target_type') ?? '',
    target_id: text(formData, 'target_id') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const result = await applyGoalTags(session, {
    targetType: input.target_type,
    targetId: input.target_id,
    goalIds: input.goal_ids,
  });

  if (result.error) return { error: `付け直せませんでした: ${result.error}` };

  revalidatePath('/goals');
  if (input.target_type === 'daily_report') revalidatePath(`/report/${input.target_id}`);

  if (result.added === 0 && result.removed === 0) return { success: '変わりはありません。' };
  return { success: '目標を付け直しました。' };
}
