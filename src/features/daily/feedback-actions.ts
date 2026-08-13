'use server';

import { revalidatePath } from 'next/cache';

import { sendNotification } from '@/features/notifications/send';
import { isStaff, requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { reportCommentSchema } from './schemas';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 依頼書3章の5「フィードバックが次の練習の課題につながる」の、いちばん短い経路。
 * 動画を撮って質問するほどではない日の、ひとことの往復をここで担う。
 *
 * 守ること:
 *   * **「自分だけ」にした日報にはコメントしない。**
 *     選手が公開範囲を private にするのは「コーチにも見せたくない」という意思表示。
 *     0022 の RLS で塞いであるが、ここでも先に断って理由を伝える。
 *   * 差出人は偽らせない（author_id はサーバで決める）。
 *   * 上書きしない。追記だけ（55章と同じ）。消せるのは書いた本人だけ。
 *   * **受け取りの印は、日報を書いた本人しか動かせない**（0027）。
 *     コーチが「読まれたことにする」を作れると、この仕組みの意味が消える。
 *     判断は DB 側（関数とトリガ）に置いてあり、ここはその入口。
 */

export interface ReportCommentState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/**
 * コメントを書く（0027 で広げた）。
 *
 * 書けるのは
 *   * **その日報を書いた本人**（質問を出すため）
 *   * 全員の日報を見る権限がある人（コーチ・スタッフ）
 *
 * 他人の日報に、ほかの選手が書くことはできない。
 * 「見えるから書ける」にすると、日報が人前のものになる。
 */
export async function postReportComment(
  _prevState: ReportCommentState,
  formData: FormData,
): Promise<ReportCommentState> {
  const session = await requireSession();

  const parsed = reportCommentSchema.safeParse({
    daily_report_id: text(formData, 'daily_report_id'),
    body: text(formData, 'body'),
    parent_id: text(formData, 'parent_id'),
    mention_member_ids: formData
      .getAll('mention_member_ids')
      .filter((value): value is string => typeof value === 'string' && value !== ''),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 見えない日報は、そもそも返ってこない（RLS）。
  // ここで弾いておくと「なぜ書けないのか」を伝えられる。
  const { data: report } = await supabase
    .from('daily_reports')
    .select('id, team_id, team_member_id, report_date, visibility, status')
    .eq('team_id', session.teamId)
    .eq('id', input.daily_report_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!report) {
    return { error: 'その日報は見つかりません。公開範囲が「自分だけ」になっている可能性があります。' };
  }

  const isOwn = report.team_member_id === session.teamMemberId;

  if (!isOwn && !isStaff(session)) {
    return { error: 'ほかの人の日報にはコメントできません。' };
  }

  // 「自分だけ」は「コーチにも見せたくない」という意思表示（16章）。
  // 本人が自分用のメモを書くのは妨げない。
  if (report.visibility === 'private' && !isOwn) {
    return { error: 'この日報は「自分だけ」に設定されています。コメントはできません。' };
  }

  const { data: created, error } = await supabase
    .from('report_feedbacks')
    .insert({
      team_id: session.teamId,
      daily_report_id: report.id,
      // 差出人はサーバが決める。画面から受け取らない。
      author_id: session.profileId,
      parent_id: input.parent_id,
      body: input.body,
    })
    .select('id')
    .single();

  if (error || !created) {
    return { error: `コメントを書けませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  await addMentions(session, {
    feedbackId: created.id,
    memberIds: input.mention_member_ids,
    reportId: report.id,
    reportDate: report.report_date,
    body: input.body,
    fromPlayer: isOwn,
  });

  // 選手が書いたときはコーチへ、コーチが書いたときは選手へ。
  // 呼ばれた人には上で届いているので、ここは重ねない。
  if (!isOwn) {
    await notifyReportAuthor(session, {
      reportId: report.id,
      targetMemberId: report.team_member_id,
      reportDate: report.report_date,
      body: input.body,
    });
  }

  revalidatePath(`/report/${report.id}`);
  revalidatePath('/report');
  revalidatePath('/admin/submissions');
  revalidatePath('/today');

  if (isOwn) {
    return {
      success:
        input.mention_member_ids.length > 0
          ? '質問を書きました。選んだコーチに知らせが届きます。'
          : '書きました。コーチが読んだら返事が届きます。',
    };
  }
  return { success: 'コメントを書きました。選手に通知が届きます。' };
}

/**
 * 受け取りました（0027）。
 *
 * 押すのは**日報を書いた本人だけ**。
 * 「開いた」ではなく「押した」を既読にする。
 * 開いただけを既読にすると、読んでいないのに読んだことになり、
 * コーチには届いたように見える。いちばん大事な信頼が静かに壊れる。
 */
export async function acknowledgeReportFeedbacks(
  _prevState: ReportCommentState,
  formData: FormData,
): Promise<ReportCommentState> {
  await requireSession();

  const reportId = text(formData, 'daily_report_id');
  if (reportId === '') return { error: '対象の日報が分かりません。' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('acknowledge_report_feedbacks', { p_report_id: reportId });

  if (error) return { error: `確認できませんでした: ${error.message}` };

  revalidatePath(`/report/${reportId}`);
  revalidatePath('/report');
  revalidatePath('/today');

  if ((data ?? 0) === 0) return { success: '新しく届いているものはありません。' };
  return { success: `${data}件を受け取りました。` };
}

/**
 * 呼ばれた人に知らせる（0027）。
 *
 * 通知が作れなくてもコメント自体は成立させる。
 * ただし**黙って捨てない**（0015 の教訓）。
 */
async function addMentions(
  session: AppSession,
  input: {
    feedbackId: string;
    memberIds: string[];
    reportId: string;
    reportDate: string;
    body: string;
    fromPlayer: boolean;
  },
): Promise<void> {
  if (input.memberIds.length === 0) return;

  try {
    const supabase = await createClient();

    const { error: mentionError } = await supabase.from('report_feedback_mentions').insert(
      input.memberIds.map((memberId) => ({
        team_id: session.teamId,
        report_feedback_id: input.feedbackId,
        team_member_id: memberId,
      })),
    );
    if (mentionError) {
      console.warn(`[report] 宛先を付けられませんでした: ${mentionError.message}`);
      return;
    }

    const { error } = await sendNotification(session, {
      type: input.fromPlayer ? 'report_question' : 'report_commented',
      title: input.fromPlayer ? '日報に質問が届いています' : '日報にコメントが届きました',
      body: input.body.slice(0, 200),
      linkPath: `/report/${input.reportId}`,
      memberIds: input.memberIds,
    });
    if (error) console.warn(`[report] 知らせを送れませんでした: ${error}`);
  } catch (unexpected) {
    console.warn(`[report] 知らせを送れませんでした: ${String(unexpected)}`);
  }
}

/**
 * 自分の書いたコメントを取り消す。
 *
 * 0019 で閲覧の条件に deleted_at is null が入ったため、
 * 素朴な update では消せない。関数を通す（判定は DB 側にある）。
 */
export async function deleteReportComment(
  _prevState: ReportCommentState,
  formData: FormData,
): Promise<ReportCommentState> {
  await requireSession();

  const feedbackId = text(formData, 'feedback_id');
  const reportId = text(formData, 'daily_report_id');

  if (feedbackId === '') return { error: '対象のコメントが分かりません。' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('soft_delete_report_feedback', { p_feedback_id: feedbackId });

  if (error) return { error: `取り消せませんでした: ${error.message}` };

  if (reportId !== '') revalidatePath(`/report/${reportId}`);
  revalidatePath('/report');
  revalidatePath('/admin/submissions');

  return { success: 'コメントを取り消しました。' };
}

/**
 * 選手に知らせる（57章）。
 *
 * 通知が作れなくてもコメント自体は成立させる。
 * ただし**黙って捨てない**（0015 の教訓）。
 */
async function notifyReportAuthor(
  session: AppSession,
  input: { reportId: string; targetMemberId: string; reportDate: string; body: string },
): Promise<void> {
  // 自分の日報に自分で書いたときは知らせない（コーチも日報を書く）
  if (input.targetMemberId === session.teamMemberId) return;

  try {
    const { error } = await sendNotification(session, {
      type: 'report_commented',
      title: '日報にコメントが付きました',
      body: `${input.reportDate}の日報: ${input.body.slice(0, 100)}`,
      linkPath: `/report/${input.reportId}`,
      relatedTable: 'daily_reports',
      relatedId: input.reportId,
      memberIds: [input.targetMemberId],
    });
    if (error) console.warn(`[daily] コメントの通知を送れませんでした: ${error}`);
  } catch (unexpected) {
    console.warn('[daily] コメントの通知で予期しない失敗', unexpected);
  }
}
