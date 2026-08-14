import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';

import { Card, CardHeader } from '@/components/ui/card';
import { countCommentsByVideo } from '@/features/video/board-queries';
import { VideoList } from '@/features/video/components/video-list';
import { listVideos } from '@/features/video/queries';
import { can, requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: '切り抜き' };

/** 自分のスマートフォンから上げた短い動画。自分の話をする。 */
export default async function ClipVideosPage() {
  const session = await requireSession();
  const canUpload = can(session, 'video.upload');

  const videos = await listVideos(session);
  const clips = videos.filter((video) => video.provider === 'r2');
  const counts = await countCommentsByVideo(clips.map((video) => video.id));

  // 自分が上げたものを先に。たいてい探しているのは自分のもの。
  const mine = clips.filter((video) => video.created_by === session.profileId);
  const others = clips.filter((video) => video.created_by !== session.profileId);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/videos" className="text-keio-700 dark:text-keio-300 underline">
          ← 動画へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">切り抜き</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          自主練や気になった場面を、その場で撮って書き込めます。
        </p>
      </header>

      {canUpload ? (
        <Link
          href="/videos/upload"
          className="bg-action-500/10 text-action-700 hover:bg-action-500/20 dark:text-action-400 flex min-h-14 items-center justify-center rounded-xl px-4 text-sm font-semibold"
        >
          スマートフォンから投稿する
        </Link>
      ) : null}

      <Card>
        <CardHeader title="自分が上げたもの" description={`${mine.length}本`} />
        <VideoList
          videos={mine}
          counts={counts}
          empty={canUpload ? 'まだありません。上のボタンから投稿できます。' : 'まだありません。'}
        />
      </Card>

      {others.length > 0 ? (
        <Card>
          <CardHeader title="見られるほかの切り抜き" description={`${others.length}本`} />
          <VideoList videos={others} counts={counts} empty="ありません。" />
        </Card>
      ) : null}
    </div>
  );
}
