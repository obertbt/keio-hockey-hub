import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { R2Player } from '@/features/upload/components/r2-player';
import { suggestGoalsForToday } from '@/features/goals/lib/goals';
import { getGoalOverview } from '@/features/goals/queries';
import { listBoard, listMentionCandidates } from '@/features/video/board-queries';
import { VideoBoard, VideoBoardForm, type BoardItem } from '@/features/video/components/video-board';
import { VideoVisibilityControl } from '@/features/video/components/video-visibility';
import { VideoWatch } from '@/features/video/components/video-watch';
import { getVideo, listClips } from '@/features/video/queries';
import { isStaff, requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { formatSecondsToTimecode, parseTimecodeToSeconds } from '@/lib/storage/validation';

export const metadata: Metadata = { title: '動画' };

/**
 * 動画1本と、その掲示板（0024）。
 *
 * これまでは「場面を登録する」→「その場面について質問を作る」の2段階だった。
 * ひとこと書きたいだけの選手には重すぎたので、掲示板に一本化した。
 *
 * 時間を押すと、そこから再生し直す。
 * 「12:34 のところ」と書かれていても、自分で送るのは手間なので。
 */
export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clip?: string; t?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { clip: clipParam, t } = await searchParams;

  const video = await getVideo(session, id);
  if (!video) notFound();

  const [clips, board, candidates, goalOverview] = await Promise.all([
    listClips(session, id),
    listBoard(id),
    listMentionCandidates(session),
    getGoalOverview(session),
  ]);

  // 0026: どの目標の話かを、書き込みと同じ1回の操作で残せるようにする。
  // 大分類も渡す。目標だけ平らに並べると、どれがどの話か分からなくなる。
  const categoryNameById = new Map(goalOverview.categories.map((category) => [category.id, category.name]));
  const pickableGoals = suggestGoalsForToday(goalOverview.items).map((entry) => ({
    id: entry.goal.id,
    name: entry.goal.name,
    categoryName:
      entry.goal.skill_category_id === null
        ? null
        : (categoryNameById.get(entry.goal.skill_category_id) ?? null),
  }));

  const startSeconds = t ? parseTimecodeToSeconds(t) : null;

  // 上げた本人は自由に。スタッフは狭める側だけ（29章）。
  const isOwner = video.created_by === session.profileId;
  const canTouchVisibility = isOwner || isStaff(session);

  const items: BoardItem[] = board.map((entry) => ({
    id: entry.comment.id,
    authorName: entry.authorName,
    authorProfileId: entry.comment.author_id,
    atSeconds: entry.comment.at_seconds,
    body: entry.comment.body,
    visibility: entry.comment.visibility,
    createdAt: entry.comment.created_at,
    mentions: entry.mentions,
    replies: entry.replies.map((reply) => ({
      id: reply.comment.id,
      authorName: reply.authorName,
      authorProfileId: reply.comment.author_id,
      body: reply.comment.body,
      createdAt: reply.comment.created_at,
      mentions: reply.mentions,
    })),
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/videos" className="text-keio-700 dark:text-keio-300 underline">
          ← 動画一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">{video.title}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {video.recorded_at ? formatDateTimeInTokyo(video.recorded_at).split(' ')[0] : '撮影日未設定'}
          {video.duration_seconds ? ` / ${formatSecondsToTimecode(video.duration_seconds)}` : ''}
        </p>
        {video.description ? <p className="mt-2 text-sm whitespace-pre-line">{video.description}</p> : null}
      </header>

      {video.provider === 'youtube' && video.provider_video_id ? (
        <VideoWatch
          providerVideoId={video.provider_video_id}
          clips={clips}
          selectedClipId={clipParam ?? null}
          startSeconds={startSeconds}
        />
      ) : video.provider === 'r2' ? (
        // 22章: 署名付き URL は毎回発行する。DB には保存しない。
        <R2Player videoId={video.id} />
      ) : (
        <Card>
          <EmptyState>この動画は再生できません。</EmptyState>
        </Card>
      )}

      <Card>
        <CardHeader title="書き込み" description={`${items.length}件。時間を押すと、そこから再生します。`} />
        <VideoBoard
          videoId={video.id}
          items={items}
          myProfileId={session.profileId}
          candidates={candidates}
        />
      </Card>

      <Card>
        <CardHeader title="気づいたことを書く" description="ひとことで構いません。" />
        <VideoBoardForm videoId={video.id} candidates={candidates} goals={pickableGoals} />
      </Card>

      {/*
        公開範囲を手で変えられるようにする。
        取り込んだ動画は「部内全員」で入るが、
        他校との練習試合など、狭めたいものもある。
      */}
      {canTouchVisibility ? (
        <Card>
          <CardHeader title="この動画を見られる人" />
          <VideoVisibilityControl videoId={video.id} current={video.visibility} canOpenToTeam={isOwner} />
        </Card>
      ) : null}
    </div>
  );
}
