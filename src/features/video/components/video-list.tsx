import { Link } from '@/components/ui/link';
import { MessageSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { formatSecondsToTimecode } from '@/lib/storage/validation';
import type { VideoRow } from '@/types/database.types';

/**
 * 動画の一覧（2種類の画面で使い回す）。
 *
 * 書き込みの件数を出す。
 * どこで話が動いているかが、開く前に分かるようにする。
 */
export function VideoList({
  videos,
  counts,
  empty,
}: {
  videos: VideoRow[];
  counts: Map<string, number>;
  empty: string;
}) {
  if (videos.length === 0) return <EmptyState>{empty}</EmptyState>;

  return (
    <ul className="divide-y divide-[--color-border]">
      {videos.map((video) => {
        const count = counts.get(video.id) ?? 0;
        return (
          <li key={video.id} className="py-3">
            <Link href={`/videos/${video.id}`} className="flex items-start gap-3">
              {video.thumbnail_url ? (
                // YouTube のサムネイル。next/image を通さない（外部ホストを許可しないため）。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url}
                  alt=""
                  className="h-14 w-24 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{video.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                  <span>
                    {video.recorded_at
                      ? formatDateTimeInTokyo(video.recorded_at).split(' ')[0]
                      : '撮影日未設定'}
                    {video.duration_seconds ? ` / ${formatSecondsToTimecode(video.duration_seconds)}` : ''}
                  </span>
                  {count > 0 ? (
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} aria-hidden />
                      {count}
                    </span>
                  ) : null}
                </p>
                {video.visibility !== 'team' ? (
                  <Badge tone="warning" className="mt-1">
                    コーチとスタッフのみ
                  </Badge>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
