import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  AcknowledgeButton,
  DeleteCommentButton,
  ReplyForm,
  ReportCommentForm,
} from '@/features/daily/components/report-comments';
import { getReportDetail } from '@/features/daily/feedback-queries';
import { describeDisclosure } from '@/features/daily/lib/disclosure';
import { isStaff, requireSession } from '@/lib/auth/session';
import { formatDateLabel, formatDateTimeInTokyo } from '@/lib/datetime';
import { REPORT_VISIBILITY_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '日報' };

/**
 * 日報1件と、そこに付いたコーチのコメント（16章）。
 *
 * 選手は「自分の日報に何が返ってきたか」を、
 * コーチは「読んで、ひとこと返す」をここで済ませる。
 *
 * 見えるかどうかは RLS が決める（0022）。
 * 「自分だけ」にした日報は、コーチが URL を直接開いても出てこない。
 */
export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const detail = await getReportDetail(session, id);
  if (!detail) notFound();

  const { report, authorName, comments, unacknowledgedCount } = detail;
  const isOwn = report.team_member_id === session.teamMemberId;

  // 0027: 書けるのは「日報を書いた本人」と「コーチ・スタッフ」。
  // 「自分だけ」の日報に、本人以外は書けない。
  const canComment = isOwn || (isStaff(session) && report.visibility !== 'private');

  /*
    0027 で入力欄を8つに絞ったが、**列は消していない**。
    過去に書いたものは、中身があるかぎりここに出す。
    入力欄から外れたことと、書いたものが消えることは別。
  */
  const sections: { label: string; value: string | null }[] = [
    { label: 'できたこと', value: report.what_went_well },
    { label: '反省点', value: report.what_went_wrong },
    { label: '次回に向けた取り組み', value: report.next_action },
    { label: '自由記述', value: report.free_note },
    { label: '今日の目標', value: report.personal_goal },
    { label: 'やったこと', value: report.what_happened },
    { label: '原因', value: report.cause },
    { label: '改善すること', value: report.improvement },
    { label: '次に防ぐには', value: report.prevention },
    { label: 'その場での対応', value: report.response_taken },
  ].filter((section) => section.value !== null && section.value !== '');

  const ratings: { label: string; value: number | null }[] = [
    { label: '自己評価', value: report.self_rating },
    { label: '疲労度', value: report.fatigue_level },
    { label: '強度', value: report.intensity },
    { label: '気分', value: report.mood },
    { label: '調子', value: report.condition_level },
  ].filter((rating) => rating.value !== null);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link
          href={isOwn ? '/report' : '/admin/submissions'}
          className="text-keio-700 dark:text-keio-300 underline"
        >
          {isOwn ? '← 日報へ戻る' : '← 提出状況へ戻る'}
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(report.report_date)}</p>
        <h1 className="mt-1 text-xl font-bold">{isOwn ? '自分の日報' : `${authorName}さんの日報`}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          {report.status === 'submitted' ? (
            <Badge tone="success">提出済み</Badge>
          ) : (
            <Badge tone="warning">下書き</Badge>
          )}
          <Badge tone="neutral">{REPORT_VISIBILITY_LABELS[report.visibility]}</Badge>
          {report.submitted_at ? (
            <span className="text-xs text-[--color-muted]">
              提出 {formatDateTimeInTokyo(report.submitted_at)}
            </span>
          ) : null}
        </p>
      </header>

      <Card>
        <CardHeader title="内容" />
        {sections.length === 0 ? (
          <EmptyState>まだ何も書かれていません。</EmptyState>
        ) : (
          <dl className="space-y-3">
            {sections.map((section) => (
              <div key={section.label}>
                <dt className="text-xs text-[--color-muted]">{section.label}</dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">{section.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {ratings.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-[--color-border] pt-3">
            {ratings.map((rating) => (
              <li key={rating.label} className="text-xs text-[--color-muted]">
                {rating.label}{' '}
                <span className="text-sm font-medium text-[--color-foreground]">{rating.value}</span>
                /5
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* 0027: 届いたものを読んだ、を本人が押して閉じる */}
      {isOwn && unacknowledgedCount > 0 ? (
        <Card className="border-amber-400">
          <CardHeader
            title={`まだ読んでいない返事が ${unacknowledgedCount} 件あります`}
            description="下のやり取りを読んでから押してください。"
          />
          <AcknowledgeButton reportId={report.id} count={unacknowledgedCount} />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="やり取り"
          description={
            comments.length > 0
              ? '上書きせず、届いた順に残しています。'
              : isOwn
                ? 'まだ何もありません。'
                : undefined
          }
        />

        {comments.length === 0 ? (
          <EmptyState>
            {isOwn
              ? '聞きたいことがあれば、下から書けます。コメントが付くと通知でお知らせします。'
              : 'まだ誰もコメントしていません。ひとことで構いません。'}
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {comments.map((entry) => (
              <li
                key={entry.comment.id}
                className={`rounded-lg border px-3 py-2 ${
                  isOwn &&
                  entry.comment.acknowledged_at === null &&
                  entry.comment.author_id !== session.profileId
                    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-[--color-border]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{entry.authorName}</span>
                    <span className="text-xs text-[--color-muted]">
                      {formatDateTimeInTokyo(entry.comment.created_at)}
                    </span>
                    {isOwn &&
                    entry.comment.acknowledged_at === null &&
                    entry.comment.author_id !== session.profileId ? (
                      <Badge tone="warning">未読</Badge>
                    ) : null}
                  </p>
                  {entry.comment.author_id === session.profileId ? (
                    <DeleteCommentButton feedbackId={entry.comment.id} reportId={report.id} />
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{entry.comment.body}</p>

                {entry.mentions.length > 0 ? (
                  <p className="mt-1 text-xs text-[--color-muted]">→ {entry.mentions.join('、')} さんへ</p>
                ) : null}

                {entry.replies.length > 0 ? (
                  <ol className="mt-2 space-y-2 border-l-2 border-[--color-border] pl-3">
                    {entry.replies.map((reply) => (
                      <li key={reply.comment.id}>
                        <p className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-sm font-medium">{reply.authorName}</span>
                          <span className="text-[--color-muted]">
                            {formatDateTimeInTokyo(reply.comment.created_at)}
                          </span>
                          {isOwn &&
                          reply.comment.acknowledged_at === null &&
                          reply.comment.author_id !== session.profileId ? (
                            <Badge tone="warning">未読</Badge>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm whitespace-pre-wrap">{reply.comment.body}</p>
                        {reply.comment.author_id === session.profileId ? (
                          <DeleteCommentButton feedbackId={reply.comment.id} reportId={report.id} />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {canComment ? <ReplyForm reportId={report.id} parentId={entry.comment.id} /> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {canComment ? (
        <Card>
          <CardHeader
            title={isOwn ? '書き足す' : 'コメントする'}
            description={isOwn ? undefined : '選手の通知に届きます。'}
          />
          <ReportCommentForm reportId={report.id} isOwn={isOwn} />
        </Card>
      ) : null}

      {isOwn ? (
        <p className="text-xs text-[--color-muted]">
          いまの公開範囲では、{describeDisclosure(report.visibility, report.status)}
          {report.visibility === 'private'
            ? ' 意見がほしいときは、公開範囲を「コーチまで」に変えてください。'
            : null}
        </p>
      ) : null}

      {isOwn && report.next_action ? (
        <Card>
          <CardHeader
            title="次に取り組むこと"
            description="ここに書いたことが、次の日の「今日やること」に出ます。"
          />
          <p className="text-sm whitespace-pre-wrap">{report.next_action}</p>
          <p className="mt-2 text-sm">
            <Link href="/goal" className="text-keio-700 dark:text-keio-300 underline">
              今日の目標として書く
            </Link>
          </p>
        </Card>
      ) : null}
    </div>
  );
}
