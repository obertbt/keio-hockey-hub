import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { VideoCommentRow } from '@/types/database.types';

/**
 * 動画の掲示板の読み取り（0024）。
 *
 * 「場面を登録 → 質問を作る」の2段階をやめ、
 * 動画に対して「時間 + ひとこと」が並ぶ形にした。
 *
 * 見える範囲は RLS が決める。
 * 既定はコーチとスタッフまで。本人が部内全員へ開ける。
 * 宛先にされた人には、開けられていなくても見える。
 */

export interface BoardEntry {
  comment: VideoCommentRow;
  authorName: string;
  /** 宛先にされた人の名前。 */
  mentions: string[];
  /** この書き込みへの返信。時刻順。 */
  replies: BoardEntry[];
}

export async function listBoard(videoId: string): Promise<BoardEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('video_comments')
    .select('*')
    .eq('video_id', videoId)
    .is('deleted_at', null)
    // 時間のあるものは時間順、動画全体への書き込みは先頭。
    // 「12:34 のところ」を探すとき、動画をなぞる順に並んでいるほうが早い。
    .order('at_seconds', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });

  const comments = data ?? [];
  if (comments.length === 0) return [];

  const [{ data: profiles }, { data: mentionRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', [...new Set(comments.map((comment) => comment.author_id))]),
    supabase
      .from('video_comment_mentions')
      .select('video_comment_id, team_member_id')
      .in(
        'video_comment_id',
        comments.map((comment) => comment.id),
      ),
  ]);

  const nameByProfile = new Map(
    (profiles ?? []).map((profile) => [profile.id, pick(profile.display_name, profile.full_name)]),
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
      nameByMember.set(member.id, pick(profile?.display_name, profile?.full_name));
    }
  }

  const mentionsByComment = new Map<string, string[]>();
  for (const row of mentionRows ?? []) {
    const list = mentionsByComment.get(row.video_comment_id) ?? [];
    list.push(nameByMember.get(row.team_member_id) ?? '不明');
    mentionsByComment.set(row.video_comment_id, list);
  }

  const toEntry = (comment: VideoCommentRow): BoardEntry => ({
    comment,
    authorName: nameByProfile.get(comment.author_id) ?? '不明',
    mentions: mentionsByComment.get(comment.id) ?? [],
    replies: [],
  });

  const roots: BoardEntry[] = [];
  const byId = new Map<string, BoardEntry>();

  for (const comment of comments) {
    if (comment.parent_id === null) {
      const entry = toEntry(comment);
      byId.set(comment.id, entry);
      roots.push(entry);
    }
  }

  for (const comment of comments) {
    if (comment.parent_id === null) continue;
    // 親が見えない（消された・公開範囲の外）返信は出さない。
    // 何に対する返事か分からないものを並べても、読む側が困る。
    byId.get(comment.parent_id)?.replies.push(toEntry(comment));
  }

  return roots;
}

/** 宛先に選べる人。自分は除く。 */
export interface MentionCandidate {
  teamMemberId: string;
  name: string;
  isStaff: boolean;
}

export async function listMentionCandidates(session: AppSession): Promise<MentionCandidate[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('team_members')
    .select('id, role_code, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .eq('status', 'active')
    .is('deleted_at', null);

  return (
    (data ?? [])
      .filter((member) => member.id !== session.teamMemberId)
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        return {
          teamMemberId: member.id,
          name: pick(profile?.display_name, profile?.full_name),
          isStaff: member.role_code !== 'player',
        };
      })
      // コーチを先に。呼びたい相手はたいていコーチなので、探させない。
      .sort((left, right) => {
        if (left.isStaff !== right.isStaff) return left.isStaff ? -1 : 1;
        return left.name.localeCompare(right.name, 'ja');
      })
  );
}

/** 自分が呼ばれていて、まだ返事をしていないもの。 */
export async function countOpenMentions(session: AppSession): Promise<number> {
  const supabase = await createClient();

  const { data: mentions } = await supabase
    .from('video_comment_mentions')
    .select('video_comment_id')
    .eq('team_member_id', session.teamMemberId);

  const commentIds = (mentions ?? []).map((row) => row.video_comment_id);
  if (commentIds.length === 0) return 0;

  // 自分が返信済みのものは数えない
  const { data: myReplies } = await supabase
    .from('video_comments')
    .select('parent_id')
    .eq('author_id', session.profileId)
    .in('parent_id', commentIds)
    .is('deleted_at', null);

  const answered = new Set((myReplies ?? []).map((row) => row.parent_id));

  const { data: alive } = await supabase
    .from('video_comments')
    .select('id')
    .in('id', commentIds)
    .is('deleted_at', null);

  return (alive ?? []).filter((row) => !answered.has(row.id)).length;
}

function pick(display: string | null | undefined, full: string | null | undefined): string {
  if (display !== null && display !== undefined && display !== '') return display;
  return full ?? '不明';
}

/**
 * 動画ごとの書き込み件数。
 *
 * 一覧に出す。どの動画で話が動いているかが、開く前に分かる。
 * 見えない書き込みは数にも入らない（RLS がそのまま効く）。
 */
export async function countCommentsByVideo(videoIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (videoIds.length === 0) return counts;

  const supabase = await createClient();
  const { data } = await supabase
    .from('video_comments')
    .select('video_id')
    .in('video_id', videoIds)
    .is('deleted_at', null);

  for (const row of data ?? []) {
    counts.set(row.video_id, (counts.get(row.video_id) ?? 0) + 1);
  }
  return counts;
}
