import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';

import { Card, CardHeader } from '@/components/ui/card';
import { listEventsInRange } from '@/features/timeline/queries';
import { countCommentsByVideo } from '@/features/video/board-queries';
import { VideoForm } from '@/features/video/components/video-form';
import { VideoList } from '@/features/video/components/video-list';
import { listVideos } from '@/features/video/queries';
import { can, requireSession } from '@/lib/auth/session';
import { addDaysToDateOnly, todayInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '部の動画' };

/** 練習や試合を通しで撮ったもの。みんなで同じ場面を見る。 */
export default async function TeamVideosPage() {
  const session = await requireSession();
  const canUpload = can(session, 'video.upload');

  const today = todayInTokyo();
  const [videos, events] = await Promise.all([
    listVideos(session),
    canUpload
      ? listEventsInRange(session.teamId, addDaysToDateOnly(today, -60), addDaysToDateOnly(today, 7))
      : Promise.resolve([]),
  ]);

  const teamVideos = videos.filter((video) => video.provider !== 'r2');
  const counts = await countCommentsByVideo(teamVideos.map((video) => video.id));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/videos" className="text-keio-700 dark:text-keio-300 underline">
          ← 動画へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">部の動画</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          気になった場面の時間と、ひとことを書いてください。
        </p>
      </header>

      <Card>
        <CardHeader title="動画" description={`${teamVideos.length}本`} />
        <VideoList videos={teamVideos} counts={counts} empty="まだ登録されていません。" />
      </Card>

      {canUpload ? (
        <details className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
          <summary className="cursor-pointer text-sm font-semibold">手で登録する</summary>
          <p className="mt-2 mb-3 text-xs text-[--color-muted]">
            部のチャンネルに上げたものは自動で取り込まれます。 個別に足したいときだけ、こちらから。
          </p>
          <VideoForm events={events} />
        </details>
      ) : null}

      <p className="text-xs text-[--color-muted]">
        長時間の動画は YouTube に限定公開で置いてください。 このシステムは動画そのものを預かりません。
      </p>
    </div>
  );
}
