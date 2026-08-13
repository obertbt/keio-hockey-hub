'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import {
  acknowledgeReportFeedbacks,
  deleteReportComment,
  postReportComment,
  type ReportCommentState,
} from '@/features/daily/feedback-actions';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 短くていい、ということを画面でも伝える。
 * 「ちゃんと書かないと」と思わせると、忙しい日にコメントが止まる。
 */

function SubmitButton({ label = 'コメントを書く' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '送っています…' : label}
    </Button>
  );
}

export function ReportCommentForm({ reportId, isOwn }: { reportId: string; isOwn: boolean }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(postReportComment, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="daily_report_id" value={reportId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label={isOwn ? '聞きたいこと・ひとこと' : '選手へのことば'}
        htmlFor="body"
        hint={
          isOwn
            ? 'あとから思いついたことも、ここに足せます。'
            : 'ひとことで構いません。次の練習で何を試すか、が伝わると効きます。'
        }
      >
        <TextArea
          id="body"
          name="body"
          rows={3}
          required
          placeholder={
            isOwn ? '持ち出しのとき、右足からのほうがいいですか' : '切り替えが速くなっています。次は逆足も。'
          }
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

/**
 * 返信（0027）。開いたときだけ出す。
 *
 * 動画の掲示板と同じ形にしてある。覚えることを2つにしない。
 */
export function ReplyForm({ reportId, parentId }: { reportId: string; parentId: string }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(postReportComment, {});
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
      <input type="hidden" name="daily_report_id" value={reportId} />
      <input type="hidden" name="parent_id" value={parentId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <TextArea name="body" rows={2} required placeholder="やってみます" aria-label="返信" />
      <SubmitButton label="返信する" />
    </form>
  );
}

/**
 * 受け取りました（0027）。
 *
 * **「開いた」ではなく「押した」を既読にする。**
 * 開いただけを既読にすると、読んでいないのに読んだことになり、
 * コーチには届いたように見える。いちばん大事な信頼が静かに壊れる。
 *
 * 返事は求めない。押すだけで済ませられるようにしておかないと、
 * 返す言葉が思いつかない日に、読むこと自体をやめてしまう。
 */
export function AcknowledgeButton({ reportId, count }: { reportId: string; count: number }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(acknowledgeReportFeedbacks, {});

  if (count === 0) return null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="daily_report_id" value={reportId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Button type="submit" variant="action" block size="lg">
        読みました（{count}件）
      </Button>
      <p className="text-xs text-[--color-muted]">押すまで「今日」に残ります。返事は書かなくて構いません。</p>
    </form>
  );
}

/**
 * 自分の書いたコメントを取り消す。
 *
 * 一度押しただけでは消さない。
 * 選手が読んだかもしれないものが、指の滑りで消えるのは避けたい。
 */
export function DeleteCommentButton({ feedbackId, reportId }: { feedbackId: string; reportId: string }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(deleteReportComment, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="feedback_id" value={feedbackId} />
      <input type="hidden" name="daily_report_id" value={reportId} />

      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          本当に取り消す
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          取り消す
        </Button>
      )}

      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
