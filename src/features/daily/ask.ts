import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 日報から出す質問（0027）。
 *
 * **ここは 'use server' に置かない。**
 * 'use server' から出した関数は外から直接呼べる。
 * 呼ぶ側（日報の保存）が認可を通したあとで使う。
 *
 * 質問は report_feedbacks の1件として作る。専用の表は作らない。
 * そうすると、コーチの返事がそのまま同じ列に並ぶ。
 * 「質問」と「コメント」を別の入れ物にすると、会話が2か所に割れる。
 */
export async function postReportQuestion(
  session: AppSession,
  input: {
    reportId: string;
    body: string;
    /** 呼びたいコーチ。空なら誰にも通知は飛ばない。 */
    memberIds: string[];
    reportDate: string;
  },
): Promise<{ error?: string }> {
  const body = input.body.trim();
  if (body === '') return {};

  const supabase = await createClient();

  // 同じ日報に、同じ本文の質問を二重に作らない。
  // 日報を出し直すたびに質問が増えると、コーチ側が読めなくなる。
  const { data: existing } = await supabase
    .from('report_feedbacks')
    .select('id')
    .eq('daily_report_id', input.reportId)
    .eq('author_id', session.profileId)
    .eq('body', body)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) return {};

  const { data: created, error } = await supabase
    .from('report_feedbacks')
    .insert({
      team_id: session.teamId,
      daily_report_id: input.reportId,
      author_id: session.profileId,
      body,
    })
    .select('id')
    .single();

  if (error || !created) return { error: error?.message ?? '不明なエラー' };

  if (input.memberIds.length === 0) return {};

  const { error: mentionError } = await supabase.from('report_feedback_mentions').insert(
    input.memberIds.map((memberId) => ({
      team_id: session.teamId,
      report_feedback_id: created.id,
      team_member_id: memberId,
    })),
  );
  if (mentionError) return { error: mentionError.message };

  // 呼ばれた人にだけ知らせる。全員に飛ばすと読まれなくなる（0024 と同じ）。
  const { data: notification, error: notifyError } = await supabase
    .from('notifications')
    .insert({
      team_id: session.teamId,
      notification_type: 'report_question',
      title: '日報に質問が届いています',
      body: body.slice(0, 200),
      link_path: `/report/${input.reportId}`,
      created_by: session.profileId,
    })
    .select('id')
    .single();

  if (notifyError || !notification) return { error: notifyError?.message ?? '不明なエラー' };

  const { error: targetError } = await supabase.from('notification_targets').insert(
    input.memberIds.map((memberId) => ({
      notification_id: notification.id,
      team_member_id: memberId,
    })),
  );
  if (targetError) return { error: targetError.message };

  return {};
}
