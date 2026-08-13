'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Lock, MessageSquare, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import { TimecodeInput } from '@/components/ui/timecode-input';
import { GoalPicker, type PickableGoal } from '@/features/goals/components/goal-picker';
import {
  deleteVideoComment,
  postVideoComment,
  replyToVideoComment,
  setVideoCommentVisibility,
  type BoardActionState,
} from '@/features/video/board-actions';
import type { MentionCandidate } from '@/features/video/board-queries';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

/**
 * 動画の掲示板（0024）。
 *
 * 「場面を登録する」→「質問を作る」の2段階をやめた。
 * 動画に対して、時間とひとことを1つの様式で書く。
 *
 * 既定はコーチとスタッフまで。
 * 書いた本人だけが部内全員へ開ける（29章と同じ考え方）。
 */

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block variant="action" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** 呼びたい相手を選ぶ。押すだけ。名前を打たせない。 */
function MentionPicker({ candidates }: { candidates: MentionCandidate[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  if (candidates.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">誰かに見てほしいとき</p>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((candidate) => {
          const active = selected.includes(candidate.teamMemberId);
          return (
            <button
              key={candidate.teamMemberId}
              type="button"
              onClick={() => toggle(candidate.teamMemberId)}
              aria-pressed={active}
              className={`min-h-9 rounded-full border px-3 text-xs ${
                active
                  ? 'border-action-500 bg-action-500/15 text-action-700 dark:text-action-400 font-medium'
                  : 'border-[--color-border] text-[--color-muted]'
              }`}
            >
              {candidate.isStaff ? `${candidate.name}（コーチ）` : candidate.name}
            </button>
          );
        })}
      </div>
      {selected.map((id) => (
        <input key={id} type="hidden" name="mention_member_ids" value={id} />
      ))}
      <p className="text-xs text-[--color-muted]">
        選ぶと、その人に知らせが届きます。選ばなくても書き込めます。
      </p>
    </div>
  );
}

/** 書き込む欄。 */
export function VideoBoardForm({
  videoId,
  candidates,
  goals = [],
}: {
  videoId: string;
  candidates: MentionCandidate[];
  /** 選べる目標（0026）。取り組み中のものだけ。 */
  goals?: PickableGoal[];
}) {
  const [state, formAction] = useActionState<BoardActionState, FormData>(postVideoComment, {});
  const [openToTeam, setOpenToTeam] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="video_id" value={videoId} />
      <input type="hidden" name="visibility" value={openToTeam ? 'team' : 'staff'} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label="動画のどこか"
        htmlFor="at_seconds"
        hint="空でもかまいません（動画全体の話として書けます）"
      >
        <TimecodeInput id="at_seconds" name="at_seconds" placeholder="1234" />
      </Field>

      <Field label="気づいたこと" htmlFor="body">
        <TextArea
          id="body"
          name="body"
          rows={3}
          required
          placeholder="持ち出しが遅くて、相手に寄せられています"
        />
      </Field>

      <MentionPicker candidates={candidates} />

      {/* 0026: この書き込みが、どの目標の話かを残す。あとから振り替えられる。 */}
      <GoalPicker
        goals={goals}
        label="どの目標の話か"
        hint="選ばなくても書けます。選ぶと、その目標に積み上がります。"
      />

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={openToTeam}
          onChange={(event) => setOpenToTeam(event.target.checked)}
          className="size-4"
        />
        部内全員に見えるようにする
      </label>
      <p className="-mt-2 text-xs text-[--color-muted]">
        既定はコーチとスタッフまでです。あとから切り替えられます。
      </p>

      <SubmitButton label="書き込む" pendingLabel="送っています…" />
    </form>
  );
}

/** 返信欄。開いたときだけ出す。 */
function ReplyForm({ parentId, candidates }: { parentId: string; candidates: MentionCandidate[] }) {
  const [state, formAction] = useActionState<BoardActionState, FormData>(replyToVideoComment, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        返信する
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="parent_id" value={parentId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <TextArea name="body" rows={2} required placeholder="半歩前で受けてみましょう" aria-label="返信" />
      <MentionPicker candidates={candidates} />
      <SubmitButton label="返信する" pendingLabel="送っています…" />
    </form>
  );
}

/** 公開範囲の切り替え。書いた本人にだけ出す。 */
function VisibilityToggle({ commentId, current }: { commentId: string; current: 'staff' | 'team' }) {
  const [state, formAction] = useActionState<BoardActionState, FormData>(setVideoCommentVisibility, {});
  const next = current === 'team' ? 'staff' : 'team';

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="comment_id" value={commentId} />
      <input type="hidden" name="visibility" value={next} />
      <Button type="submit" variant="ghost" size="sm">
        {current === 'team' ? 'コーチまでに戻す' : '部内全員に見せる'}
      </Button>
      {state.error ? (
        <span role="alert" className="ml-1 text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** 取り消し。一度押しただけでは消さない。 */
function DeleteButton({ commentId, videoId }: { commentId: string; videoId: string }) {
  const [state, formAction] = useActionState<BoardActionState, FormData>(deleteVideoComment, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="comment_id" value={commentId} />
      <input type="hidden" name="video_id" value={videoId} />
      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          本当に消す
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          消す
        </Button>
      )}
      {state.error ? (
        <span role="alert" className="ml-1 text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export interface BoardItem {
  id: string;
  authorName: string;
  authorProfileId: string;
  atSeconds: number | null;
  body: string;
  visibility: 'staff' | 'team';
  createdAt: string;
  mentions: string[];
  replies: {
    id: string;
    authorName: string;
    authorProfileId: string;
    body: string;
    createdAt: string;
    mentions: string[];
  }[];
}

/** 掲示板の中身。時間順に並ぶ。 */
export function VideoBoard({
  videoId,
  items,
  myProfileId,
  candidates,
}: {
  videoId: string;
  items: BoardItem[];
  myProfileId: string;
  candidates: MentionCandidate[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[--color-border] px-3 py-6 text-center text-sm text-[--color-muted]">
        まだ書き込みはありません。気づいたことをひとこと書いてみてください。
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-[--color-border] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {item.atSeconds === null ? (
              <span className="text-xs text-[--color-muted]">動画全体</span>
            ) : (
              // 押すと、その位置から流れる。自分で送らせない。
              <Link
                href={`/videos/${videoId}?t=${Math.floor(item.atSeconds)}`}
                className="bg-keio-100 text-keio-800 dark:bg-keio-800 dark:text-keio-100 rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {formatSecondsToTimecode(item.atSeconds)}
              </Link>
            )}

            <span className="text-sm font-medium">{item.authorName}</span>

            {item.visibility === 'team' ? (
              <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                <Users size={12} aria-hidden />
                部内全員
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-[--color-muted]">
                <Lock size={12} aria-hidden />
                コーチまで
              </span>
            )}

            <span className="text-xs text-[--color-muted]">{formatDateTimeInTokyo(item.createdAt)}</span>
          </div>

          <p className="mt-1 text-sm whitespace-pre-wrap">{item.body}</p>

          {item.mentions.length > 0 ? (
            <p className="mt-1 text-xs text-[--color-muted]">→ {item.mentions.join('、')} さんへ</p>
          ) : null}

          {item.replies.length > 0 ? (
            <ol className="mt-2 space-y-2 border-l-2 border-[--color-border] pl-3">
              {item.replies.map((reply) => (
                <li key={reply.id}>
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-sm font-medium">{reply.authorName}</span>
                    <span className="text-[--color-muted]">{formatDateTimeInTokyo(reply.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap">{reply.body}</p>
                  {reply.authorProfileId === myProfileId ? (
                    <DeleteButton commentId={reply.id} videoId={videoId} />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ReplyForm parentId={item.id} candidates={candidates} />
            {item.authorProfileId === myProfileId ? (
              <>
                <VisibilityToggle commentId={item.id} current={item.visibility} />
                <DeleteButton commentId={item.id} videoId={videoId} />
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 件数の見出し。 */
export function BoardCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1 text-xs text-[--color-muted]">
      <MessageSquare size={12} aria-hidden />
      {count}件
    </span>
  );
}
