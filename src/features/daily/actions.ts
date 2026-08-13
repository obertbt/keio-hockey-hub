'use server';

import { revalidatePath } from 'next/cache';

import { applyGoalTags } from '@/features/goals/tags';
import { requireSession } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';

import { postReportQuestion } from './ask';
import { conditionSchema, dailyReportSchema, hasEnoughToSubmit, practiceGoalSchema } from './schemas';

/**
 * 練習前・練習後の記録の書き込み。
 *
 * すべて「自分の記録」なので RLS の `*_own` ポリシーの下で動く。
 * 管理用クライアントは使わない。
 *
 * event_id は null になり得るため、unique 制約による upsert が使えない
 * （Postgres では NULL 同士は重複とみなされない）。
 * そのため「探して、あれば更新、無ければ作成」の形にしている。
 */

export interface DailyActionState {
  error?: string;
  success?: string;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** フォームの値を取り出す小道具。チェックボックスは 'on' で届く。 */
function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on';
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/** 画面から来た event_id を検証する。空文字と 'null' は null に倒す。 */
function eventIdFrom(formData: FormData): string | null {
  const value = text(formData, 'event_id');
  if (!value || value === 'null' || value.trim() === '') return null;
  return value;
}

// -------------------------------------------------------------
// 練習前コンディション
// -------------------------------------------------------------
export async function saveCondition(
  _prevState: DailyActionState,
  formData: FormData,
): Promise<DailyActionState> {
  const session = await requireSession();

  const parsed = conditionSchema.safeParse({
    recorded_on: text(formData, 'recorded_on') ?? todayInTokyo(),
    event_id: eventIdFrom(formData),
    condition_level: text(formData, 'condition_level') ?? '',
    fatigue_level: text(formData, 'fatigue_level') ?? '',
    sleep_hours: text(formData, 'sleep_hours') ?? '',
    has_pain: checkbox(formData, 'has_pain'),
    pain_note: text(formData, 'pain_note'),
    note: text(formData, 'note'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('daily_conditions')
    .select('id')
    .eq('team_member_id', session.teamMemberId)
    .eq('recorded_on', input.recorded_on)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const values = {
    condition_level: input.condition_level,
    fatigue_level: input.fatigue_level,
    sleep_hours: input.sleep_hours,
    has_pain: input.has_pain,
    // 痛みが無いのに前回のメモが残らないようにする
    pain_note: input.has_pain ? input.pain_note : null,
    note: input.note,
    event_id: input.event_id ?? null,
  };

  const { error } = existing
    ? await supabase.from('daily_conditions').update(values).eq('id', existing.id)
    : await supabase.from('daily_conditions').insert({
        team_id: session.teamId,
        team_member_id: session.teamMemberId,
        recorded_on: input.recorded_on,
        ...values,
      });

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath('/today');
  revalidatePath('/condition');
  return { success: 'コンディションを保存しました。' };
}

// -------------------------------------------------------------
// 今日の個人目標
// -------------------------------------------------------------
export async function savePracticeGoal(
  _prevState: DailyActionState,
  formData: FormData,
): Promise<DailyActionState> {
  const session = await requireSession();

  const achievedRaw = text(formData, 'achieved');

  const parsed = practiceGoalSchema.safeParse({
    target_date: text(formData, 'target_date') ?? todayInTokyo(),
    event_id: eventIdFrom(formData),
    goal: text(formData, 'goal') ?? '',
    achieved: achievedRaw === '' || achievedRaw === undefined ? null : achievedRaw === 'true',
    reflection: text(formData, 'reflection'),
  });

  // どのフィードバックから引き継いだ目標かを残す（循環の記録）
  const sourceFeedbackId = text(formData, 'source_feedback_id')?.trim() || null;

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('practice_goals')
    .select('id')
    .eq('team_member_id', session.teamMemberId)
    .eq('target_date', input.target_date)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const values = {
    goal: input.goal,
    achieved: input.achieved ?? null,
    reflection: input.reflection,
    event_id: input.event_id ?? null,
    ...(sourceFeedbackId ? { source_feedback_id: sourceFeedbackId } : {}),
  };

  const { error } = existing
    ? await supabase.from('practice_goals').update(values).eq('id', existing.id)
    : await supabase.from('practice_goals').insert({
        team_id: session.teamId,
        team_member_id: session.teamMemberId,
        target_date: input.target_date,
        ...values,
      });

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath('/today');
  revalidatePath('/goal');
  return { success: '今日の目標を保存しました。' };
}

// -------------------------------------------------------------
// 日報
// -------------------------------------------------------------
export async function saveDailyReport(
  _prevState: DailyActionState,
  formData: FormData,
): Promise<DailyActionState> {
  const session = await requireSession();

  // 「下書き保存」と「提出する」で押されたボタンを見分ける
  const status = formData.get('intent') === 'submit' ? 'submitted' : 'draft';

  const parsed = dailyReportSchema.safeParse({
    report_date: text(formData, 'report_date') ?? todayInTokyo(),
    event_id: eventIdFrom(formData),
    personal_goal: text(formData, 'personal_goal'),
    what_happened: text(formData, 'what_happened'),
    what_went_well: text(formData, 'what_went_well'),
    what_went_wrong: text(formData, 'what_went_wrong'),
    cause: text(formData, 'cause'),
    improvement: text(formData, 'improvement'),
    prevention: text(formData, 'prevention'),
    response_taken: text(formData, 'response_taken'),
    next_action: text(formData, 'next_action'),
    self_rating: text(formData, 'self_rating') ?? '',
    intensity: text(formData, 'intensity') ?? '',
    fatigue_level: text(formData, 'fatigue_level') ?? '',
    mood: text(formData, 'mood') ?? '',
    condition_level: text(formData, 'condition_level') ?? '',
    free_note: text(formData, 'free_note'),
    visibility: text(formData, 'visibility') ?? 'staff',
    status,
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  if (status === 'submitted' && !hasEnoughToSubmit(input)) {
    return {
      error:
        '提出するには、少なくとも1つは書いてください（できたこと / 反省点 / 次回に向けた取り組み / 自由記述）。下書きとしてなら空でも保存できます。',
    };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('daily_reports')
    .select('id, submitted_at')
    .eq('team_member_id', session.teamMemberId)
    .eq('report_date', input.report_date)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  /*
    0027 で入力欄を8つに絞った。

    **画面に無い列を、ここで null で上書きしない。**
    フォームが送ってこない項目をそのまま書き戻すと、
    過去に書いたもの（やったこと・原因・改善…）が、
    日報を開いて保存し直しただけで消える。
    書いたものが黙って消えるのが、いちばんやってはいけないこと。

    いま画面にあるものだけを書く。残りは触らない。
  */
  const values = {
    event_id: input.event_id ?? null,
    what_went_well: input.what_went_well,
    what_went_wrong: input.what_went_wrong,
    next_action: input.next_action,
    self_rating: input.self_rating,
    fatigue_level: input.fatigue_level,
    free_note: input.free_note,
    visibility: input.visibility,
    status: input.status,
    // 一度提出した時刻は上書きしない（いつ出したかの記録として残す）
    submitted_at: input.status === 'submitted' ? (existing?.submitted_at ?? new Date().toISOString()) : null,
  };

  const { data: saved, error } = existing
    ? await supabase.from('daily_reports').update(values).eq('id', existing.id).select('id').maybeSingle()
    : await supabase
        .from('daily_reports')
        .insert({
          team_id: session.teamId,
          team_member_id: session.teamMemberId,
          report_date: input.report_date,
          ...values,
        })
        .select('id')
        .maybeSingle();

  if (error) return { error: `保存できませんでした: ${error.message}` };

  // 0026: 「今日はどの目標に取り組んだか」を、日報と同じ1回の操作で残す。
  // 別の画面に行かせると、まず付けてもらえない。
  const reportId = saved?.id ?? existing?.id;
  if (reportId) {
    const tagResult = await applyGoalTags(session, {
      targetType: 'daily_report',
      targetId: reportId,
      goalIds: formData.getAll('goal_ids').filter((value): value is string => typeof value === 'string'),
    });
    // 日報そのものは保存できている。目標が付かなかっただけで
    // 「保存できませんでした」と出すと、書いたものが消えたように見える。
    if (tagResult.error) console.warn(`[daily] 目標を付けられませんでした: ${tagResult.error}`);

    // 0027: 質問も同じ1回の操作で出す。
    // 別の画面へ行かせると、聞きたいことがあっても聞かれないまま終わる。
    const questionResult = await postReportQuestion(session, {
      reportId,
      body: text(formData, 'question') ?? '',
      memberIds: formData
        .getAll('question_member_ids')
        .filter((value): value is string => typeof value === 'string' && value !== ''),
      reportDate: input.report_date,
    });
    // 日報そのものは保存できている。質問が付かなかっただけで
    // 「保存できませんでした」と出すと、書いたものが消えたように見える。
    if (questionResult.error) console.warn(`[daily] 質問を出せませんでした: ${questionResult.error}`);
  }

  revalidatePath('/today');
  revalidatePath('/report');
  revalidatePath('/goals');

  return {
    success: input.status === 'submitted' ? '日報を提出しました。' : '下書きを保存しました。',
  };
}
