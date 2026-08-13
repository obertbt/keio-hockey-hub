import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { DailyReportRow, ReportFeedbackRow } from '@/types/database.types';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 見えるかどうかは RLS が決める。
 * **日報が見える人にだけ、そのコメントが見える**（0022）。
 * 「自分だけ」にした日報には、コーチもコメントできない。
 */

export interface ReportComment {
  comment: ReportFeedbackRow;
  authorName: string;
  /** 宛先にされた人の名前（0027）。 */
  mentions: string[];
  /** この書き込みへの返信。時刻順。1段だけ。 */
  replies: ReportComment[];
}

/**
 * 日報のやり取りを、木の形にして返す（0027）。
 *
 * 動画の掲示板（0024）とまったく同じ形にしてある。
 * 覚えることを2つにしない。
 */
export async function listReportComments(reportId: string): Promise<ReportComment[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('report_feedbacks')
    .select('*')
    .eq('daily_report_id', reportId)
    .is('deleted_at', null)
    // 55章と同じ。上書きせず、やり取りの流れをそのまま残す。
    .order('created_at', { ascending: true });

  const comments = data ?? [];
  if (comments.length === 0) return [];

  const [{ data: profiles }, { data: mentionRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', [...new Set(comments.map((comment) => comment.author_id))]),
    supabase
      .from('report_feedback_mentions')
      .select('report_feedback_id, team_member_id')
      .in(
        'report_feedback_id',
        comments.map((comment) => comment.id),
      ),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, pickName(profile.display_name, profile.full_name)]),
  );

  // 宛先は team_members で持っているので、名前を引き直す
  const memberIds = [...new Set((mentionRows ?? []).map((row) => row.team_member_id))];
  const nameByMember = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, profiles(full_name, display_name)')
      .in('id', memberIds);

    for (const member of members ?? []) {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      nameByMember.set(member.id, pickName(profile?.display_name, profile?.full_name));
    }
  }

  const mentionsByComment = new Map<string, string[]>();
  for (const row of mentionRows ?? []) {
    const list = mentionsByComment.get(row.report_feedback_id) ?? [];
    list.push(nameByMember.get(row.team_member_id) ?? '不明');
    mentionsByComment.set(row.report_feedback_id, list);
  }

  const toEntry = (comment: ReportFeedbackRow): ReportComment => ({
    comment,
    authorName: nameById.get(comment.author_id) ?? '不明',
    mentions: mentionsByComment.get(comment.id) ?? [],
    replies: [],
  });

  const roots: ReportComment[] = [];
  const byId = new Map<string, ReportComment>();

  for (const comment of comments) {
    if (comment.parent_id === null) {
      const entry = toEntry(comment);
      byId.set(comment.id, entry);
      roots.push(entry);
    }
  }

  for (const comment of comments) {
    if (comment.parent_id === null) continue;
    // 親が見えない返信は出さない。何への返事か分からないものは、読む側が困る。
    byId.get(comment.parent_id)?.replies.push(toEntry(comment));
  }

  return roots;
}

function pickName(display: string | null | undefined, full: string | null | undefined): string {
  if (display !== null && display !== undefined && display !== '') return display;
  return full ?? '不明';
}

/** 呼びたい相手（0027）。日報からはコーチ・スタッフだけを呼べる。 */
export interface CoachCandidate {
  teamMemberId: string;
  name: string;
}

export async function listCoachCandidates(session: AppSession): Promise<CoachCandidate[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('team_members')
    .select('id, role_code, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .eq('status', 'active')
    .neq('role_code', 'player')
    .is('deleted_at', null);

  return (data ?? [])
    .filter((member) => member.id !== session.teamMemberId)
    .map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return { teamMemberId: member.id, name: pickName(profile?.display_name, profile?.full_name) };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
}

/**
 * まだ受け取っていないコーチの返事（0027）。
 *
 * **押すまで消えない。** 選手の「今日」の残っていることに出す。
 * 数え方は DB 側の関数に置いてある。画面ごとに条件がずれると、必ずどこかで1つ落ちる。
 */
export interface UnacknowledgedFeedback {
  feedbackId: string;
  reportId: string;
  reportDate: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export async function listUnacknowledgedFeedbacks(limit = 20): Promise<UnacknowledgedFeedback[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('list_unacknowledged_feedbacks', { p_limit: limit });

  return (data ?? []).map((row) => ({
    feedbackId: row.feedback_id,
    reportId: row.daily_report_id,
    reportDate: row.report_date,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export interface ReportDetail {
  report: DailyReportRow;
  authorName: string;
  comments: ReportComment[];
  /** まだ受け取りを押していない件数（自分の日報のときだけ意味がある）。 */
  unacknowledgedCount: number;
}

/** 日報1件。見えなければ null（RLS が決める）。 */
export async function getReportDetail(session: AppSession, reportId: string): Promise<ReportDetail | null> {
  const supabase = await createClient();

  const { data: report } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', reportId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!report) return null;

  const [{ data: member }, comments] = await Promise.all([
    supabase
      .from('team_members')
      .select('profiles(full_name, display_name)')
      .eq('id', report.team_member_id)
      .maybeSingle(),
    listReportComments(reportId),
  ]);

  const profile = Array.isArray(member?.profiles) ? member?.profiles[0] : member?.profiles;
  const display = profile?.display_name;

  // 自分が書いたものは確認の対象にしない（自分の言葉を自分で確認しない）
  const unacknowledgedCount = comments
    .flatMap((entry) => [entry, ...entry.replies])
    .filter(
      (entry) => entry.comment.acknowledged_at === null && entry.comment.author_id !== session.profileId,
    ).length;

  return {
    report,
    authorName: display && display !== '' ? display : (profile?.full_name ?? '不明'),
    comments,
    unacknowledgedCount,
  };
}

/**
 * 日報ごとのコメント数。
 *
 * 一覧に「返事が来ている」を出すためだけのもの。
 * 見えないコメントは数にも入らない（RLS がそのまま効く）。
 */
export async function countCommentsByReport(reportIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (reportIds.length === 0) return counts;

  const supabase = await createClient();
  const { data } = await supabase
    .from('report_feedbacks')
    .select('daily_report_id')
    .in('daily_report_id', reportIds)
    .is('deleted_at', null);

  for (const row of data ?? []) {
    counts.set(row.daily_report_id, (counts.get(row.daily_report_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * 日報ごとの「まだ受け取っていない件数」（0027）。
 *
 * 一覧に印を出すため。自分の日報でなければ 0 になる（RLS と関数がそう決める）。
 */
export async function countUnacknowledgedByReport(reportIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (reportIds.length === 0) return counts;

  const pending = await listUnacknowledgedFeedbacks(200);
  for (const item of pending) {
    if (!reportIds.includes(item.reportId)) continue;
    counts.set(item.reportId, (counts.get(item.reportId) ?? 0) + 1);
  }
  return counts;
}

/** コーチ向け: まだコメントしていない、今日の日報。 */
export async function listReportsAwaitingComment(
  session: AppSession,
  dateOnly: string,
): Promise<{ report: DailyReportRow; authorName: string; commentCount: number }[]> {
  const supabase = await createClient();

  // 見えるものだけが返る（private は入ってこない）
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('report_date', dateOnly)
    .eq('status', 'submitted')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true, nullsFirst: false });

  const rows = reports ?? [];
  if (rows.length === 0) return [];

  const [{ data: comments }, { data: members }] = await Promise.all([
    supabase
      .from('report_feedbacks')
      .select('daily_report_id')
      .in(
        'daily_report_id',
        rows.map((row) => row.id),
      )
      .is('deleted_at', null),
    supabase
      .from('team_members')
      .select('id, profiles(full_name, display_name)')
      .eq('team_id', session.teamId),
  ]);

  const countByReport = new Map<string, number>();
  for (const comment of comments ?? []) {
    countByReport.set(comment.daily_report_id, (countByReport.get(comment.daily_report_id) ?? 0) + 1);
  }

  const nameByMember = new Map(
    (members ?? []).map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      const display = profile?.display_name;
      return [member.id, display && display !== '' ? display : (profile?.full_name ?? '不明')];
    }),
  );

  return rows.map((report) => ({
    report,
    authorName: nameByMember.get(report.team_member_id) ?? '不明',
    commentCount: countByReport.get(report.id) ?? 0,
  }));
}
