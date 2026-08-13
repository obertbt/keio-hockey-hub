'use server';

import { revalidatePath } from 'next/cache';

import { requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

import { videoCommentSchema, videoReplySchema } from './schemas';

/**
 * 動画の掲示板への書き込み（0024）。
 *
 * これまでは「場面を登録する」→「その場面について質問を作る」の
 * 2段階だった。ひとこと書きたいだけの選手には重すぎたので、
 * 1つの様式で終わるようにした。
 *
 * 守ること:
 *   * 差出人はサーバが決める（画面から受け取らない）
 *   * 公開範囲の既定は staff。広げられるのは書いた本人だけ
 *   * 呼ばれた人には必ず知らせる。呼びっぱなしにしない
 */

export interface BoardActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function textList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string' && value !== '');
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** 動画に書き込む。 */
export async function postVideoComment(
  _prevState: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  const session = await requireSession();

  const parsed = videoCommentSchema.safeParse({
    video_id: text(formData, 'video_id'),
    at_seconds: text(formData, 'at_seconds'),
    body: text(formData, 'body'),
    mention_member_ids: textList(formData, 'mention_member_ids'),
    visibility: text(formData, 'visibility') === 'team' ? 'team' : 'staff',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: video } = await supabase
    .from('videos')
    .select('id, title')
    .eq('team_id', session.teamId)
    .eq('id', input.video_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!video) return { error: 'その動画は見つかりません。' };

  const { data: comment, error } = await supabase
    .from('video_comments')
    .insert({
      team_id: session.teamId,
      video_id: video.id,
      // 差出人はサーバが決める。画面から受け取らない。
      author_id: session.profileId,
      at_seconds: input.at_seconds,
      body: input.body,
      visibility: input.visibility,
    })
    .select('id')
    .single();

  if (error || !comment) {
    return { error: `書き込めませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  await addMentions(session, {
    commentId: comment.id,
    memberIds: input.mention_member_ids,
    videoId: video.id,
    videoTitle: video.title,
    body: input.body,
    atSeconds: input.at_seconds,
  });

  revalidatePath(`/videos/${video.id}`);
  revalidatePath('/videos');
  revalidatePath('/today');

  return { success: '書き込みました。' };
}

/** 返信する。会話をそのまま続ける。 */
export async function replyToVideoComment(
  _prevState: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  const session = await requireSession();

  const parsed = videoReplySchema.safeParse({
    parent_id: text(formData, 'parent_id'),
    body: text(formData, 'body'),
    mention_member_ids: textList(formData, 'mention_member_ids'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: parent } = await supabase
    .from('video_comments')
    .select('id, video_id, author_id, at_seconds')
    .eq('id', input.parent_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!parent) return { error: '返信先が見つかりません。' };

  const { data: comment, error } = await supabase
    .from('video_comments')
    .insert({
      team_id: session.teamId,
      video_id: parent.video_id,
      author_id: session.profileId,
      parent_id: parent.id,
      body: input.body,
      // 公開範囲は親に従う（0024 のトリガでも直される）
      visibility: 'staff',
    })
    .select('id')
    .single();

  if (error || !comment) {
    return { error: `返信できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  const { data: video } = await supabase
    .from('videos')
    .select('title')
    .eq('id', parent.video_id)
    .maybeSingle();

  // 呼ばれた人に加えて、**元の書き込みをした人**にも知らせる。
  // 返事が付いたことに気付けないと、会話が続かない。
  const targets = new Set(input.mention_member_ids);
  const ownerMemberId = await memberIdOf(parent.author_id, session);
  if (ownerMemberId && ownerMemberId !== session.teamMemberId) targets.add(ownerMemberId);

  await addMentions(session, {
    commentId: comment.id,
    memberIds: input.mention_member_ids,
    notifyMemberIds: [...targets],
    videoId: parent.video_id,
    videoTitle: video?.title ?? '動画',
    body: input.body,
    atSeconds: parent.at_seconds,
  });

  revalidatePath(`/videos/${parent.video_id}`);
  revalidatePath('/today');

  return { success: '返信しました。' };
}

/** 部内全員に開ける・戻す。書いた本人だけ。 */
export async function setVideoCommentVisibility(
  _prevState: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  await requireSession();

  const commentId = text(formData, 'comment_id');
  const next = text(formData, 'visibility') === 'team' ? 'team' : 'staff';
  if (commentId === '') return { error: '対象が分かりません。' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('video_comments')
    .update({ visibility: next })
    .eq('id', commentId)
    .select('id, video_id')
    .maybeSingle();

  if (error) return { error: `変えられませんでした: ${error.message}` };
  if (!data) return { error: '自分が書いたものだけ変えられます。' };

  revalidatePath(`/videos/${data.video_id}`);

  return {
    success: next === 'team' ? '部内全員に見えるようにしました。' : 'コーチとスタッフまでに戻しました。',
  };
}

/** 取り消す。書いた本人だけ。 */
export async function deleteVideoComment(
  _prevState: BoardActionState,
  formData: FormData,
): Promise<BoardActionState> {
  await requireSession();

  const commentId = text(formData, 'comment_id');
  const videoId = text(formData, 'video_id');
  if (commentId === '') return { error: '対象が分かりません。' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('soft_delete_video_comment', { p_comment_id: commentId });

  if (error) return { error: `取り消せませんでした: ${error.message}` };

  if (videoId !== '') revalidatePath(`/videos/${videoId}`);
  return { success: '取り消しました。' };
}

// -------------------------------------------------------------
// 宛先と通知
// -------------------------------------------------------------

/** プロフィールから、このチームでの部員 id を引く。 */
async function memberIdOf(profileId: string, session: AppSession): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', session.teamId)
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * 宛先を残し、呼ばれた人に知らせる。
 *
 * 通知が作れなくても書き込み自体は成立させる。
 * ただし**黙って捨てない**（0015 の教訓）。
 */
async function addMentions(
  session: AppSession,
  input: {
    commentId: string;
    memberIds: string[];
    /** 通知だけ送りたい相手（返信のとき、元の書き手を含める）。 */
    notifyMemberIds?: string[];
    videoId: string;
    videoTitle: string;
    body: string;
    atSeconds: number | null;
  },
): Promise<void> {
  const supabase = await createClient();

  if (input.memberIds.length > 0) {
    const { error } = await supabase.from('video_comment_mentions').insert(
      input.memberIds.map((memberId) => ({
        team_id: session.teamId,
        video_comment_id: input.commentId,
        team_member_id: memberId,
      })),
    );
    if (error) console.warn(`[video] 宛先を残せませんでした: ${error.message}`);
  }

  const targets = input.notifyMemberIds ?? input.memberIds;
  if (targets.length === 0) return;

  const where = input.atSeconds === null ? '' : `${formatSecondsToTimecode(input.atSeconds)} `;

  try {
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        team_id: session.teamId,
        notification_type: 'video_mentioned',
        title: `${session.displayName}さんが動画に書き込みました`,
        body: `${input.videoTitle} ${where}${input.body.slice(0, 80)}`,
        link_path: `/videos/${input.videoId}`,
        related_table: 'video_comments',
        related_id: input.commentId,
        created_by: session.profileId,
      })
      .select('id')
      .single();

    if (error || !notification) {
      console.warn(`[video] 通知を作れませんでした: ${error?.message ?? '不明'}`);
      return;
    }

    const { error: targetError } = await supabase.from('notification_targets').insert(
      targets.map((memberId) => ({
        notification_id: notification.id,
        team_member_id: memberId,
      })),
    );
    if (targetError) console.warn(`[video] 通知の宛先を作れませんでした: ${targetError.message}`);
  } catch (unexpected) {
    console.warn('[video] 通知で予期しない失敗', unexpected);
  }
}
