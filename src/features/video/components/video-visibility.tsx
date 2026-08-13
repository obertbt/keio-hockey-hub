'use client';

import { useActionState } from 'react';
import { Lock, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { setVideoVisibility, type VideoActionState } from '@/features/video/actions';
import { VIDEO_VISIBILITY_LABELS } from '@/features/video/lib/visibility';
import type { MediaVisibility } from '@/types/database.types';

/**
 * 動画1本の公開範囲を手で変える。
 *
 * 押せるのは、上げた本人とスタッフだけ。
 * ただしスタッフは狭める側にしか動かせない（29章）。
 * 押せないボタンを出して断るのではなく、**最初から出さない**。
 */
export function VideoVisibilityControl({
  videoId,
  current,
  canOpenToTeam,
}: {
  videoId: string;
  current: MediaVisibility;
  /** 部内全員へ広げてよい人か（＝上げた本人）。 */
  canOpenToTeam: boolean;
}) {
  const [state, formAction] = useActionState<VideoActionState, FormData>(setVideoVisibility, {});
  const openToTeam = current === 'team';

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm">
        {openToTeam ? (
          <Users size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden />
        ) : (
          <Lock size={14} className="text-[--color-muted]" aria-hidden />
        )}
        いまは <span className="font-medium">{VIDEO_VISIBILITY_LABELS[current]}</span> が見られます
      </p>

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {openToTeam ? (
        <form action={formAction}>
          <input type="hidden" name="video_id" value={videoId} />
          <input type="hidden" name="visibility" value="private_staff" />
          <Button type="submit" variant="ghost" size="sm">
            コーチとスタッフまでに狭める
          </Button>
        </form>
      ) : canOpenToTeam ? (
        <form action={formAction}>
          <input type="hidden" name="video_id" value={videoId} />
          <input type="hidden" name="visibility" value="team" />
          <Button type="submit" variant="ghost" size="sm">
            部内全員に見せる
          </Button>
        </form>
      ) : (
        <p className="text-xs text-[--color-muted]">
          部内全員へ広げられるのは、この動画を上げた本人だけです。
        </p>
      )}

      <p className="text-xs text-[--color-muted]">
        狭めても、YouTube 側の公開設定は変わりません。リンクを知っている人はそちらでは見られます。
      </p>
    </div>
  );
}
