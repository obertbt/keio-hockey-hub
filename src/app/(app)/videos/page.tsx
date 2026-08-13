import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Scissors, Video as VideoIcon } from 'lucide-react';

import { countCommentsByVideo } from '@/features/video/board-queries';
import { listVideos } from '@/features/video/queries';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: '動画' };

/**
 * 動画タブの入口。
 *
 * やることが2つに分かれるので、先に選んでもらう。
 *
 *   1. 部の動画にコメントする   …… 練習や試合を通しで撮ったもの
 *   2. 切り抜きに自分でコメントする …… 自分のスマートフォンから上げた短いもの
 *
 * 混ぜて並べると、長いものと短いものが入り交じって探しにくい。
 * ここでは選ぶだけにして、探す作業を先送りする。
 */
export default async function VideosPage() {
  const session = await requireSession();

  const videos = await listVideos(session);
  const counts = await countCommentsByVideo(videos.map((video) => video.id));

  const teamVideos = videos.filter((video) => video.provider !== 'r2');
  const clips = videos.filter((video) => video.provider === 'r2');

  const sum = (list: typeof videos) => list.reduce((total, video) => total + (counts.get(video.id) ?? 0), 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">動画</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          気になった場面に、時間つきで書き込めます。コーチや仲間を呼ぶこともできます。
        </p>
      </header>

      <ChoiceLink
        href="/videos/team"
        icon={<VideoIcon size={24} aria-hidden />}
        label="動画にコメントする"
        detail={`部の動画 ${teamVideos.length}本 / 書き込み ${sum(teamVideos)}件`}
      />

      <ChoiceLink
        href="/videos/clips"
        icon={<Scissors size={24} aria-hidden />}
        label="切り抜き動画を自分でコメントする"
        detail={`切り抜き ${clips.length}本 / 書き込み ${sum(clips)}件`}
      />
    </div>
  );
}

/**
 * 選ぶためのボタン。
 *
 * 一覧の中の1行ではなく、面で置く。
 * 指1本で押せる大きさにして、迷う時間を無くす。
 */
function ChoiceLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="bg-action-500/10 text-action-700 hover:bg-action-500/20 dark:text-action-400 flex min-h-20 items-center gap-3 rounded-xl px-4 py-4"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-[--color-muted]">{detail}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[--color-muted]" aria-hidden />
    </Link>
  );
}
