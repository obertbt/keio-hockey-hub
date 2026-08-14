import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  AchievedToggle,
  GoalDeleteButton,
  GoalEditForm,
  GoalMergeForm,
} from '@/features/goals/components/goal-forms';
import { describeActivity } from '@/features/goals/lib/goals';
import { getGoalOverview, listGoalTrace } from '@/features/goals/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, formatDateTimeInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '目標' };

/**
 * 目標1つ（0026）。
 *
 * この画面のいちばんの役割は、**積み上がったものを見せる**こと。
 * 「この目標に、いつ何を書いたか」が並ぶ。
 * 承認の代わりに、これが手ざわりになる（3章の6）。
 */
export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const overview = await getGoalOverview(session);
  const item = overview.items.find((entry) => entry.goal.id === id);
  if (!item) notFound();

  const trace = await listGoalTrace(id);
  const others = overview.items
    .filter((entry) => entry.goal.id !== id)
    .map((entry) => ({ id: entry.goal.id, name: entry.goal.name }));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/goals" className="text-keio-700 dark:text-keio-300 underline">
          ← 目標の一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">{item.goal.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[--color-muted]">
          {item.goal.achieved_at === null ? (
            <Badge tone="info">取り組み中</Badge>
          ) : (
            <Badge tone="success">できるようになった</Badge>
          )}
          <span>{describeActivity(item)}</span>
        </p>
        {item.goal.note ? <p className="mt-2 text-sm whitespace-pre-line">{item.goal.note}</p> : null}
      </header>

      <Card>
        <AchievedToggle goal={item.goal} />
      </Card>

      <Card>
        <CardHeader title="この目標に付けた記録" description="日報や動画に付けると、ここに並びます。" />
        {trace.length === 0 ? (
          <EmptyState>まだありません。日報を書くときに、この目標を選んでみてください。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {trace.map((entry) => (
              <li key={entry.tag.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link href={entry.href} className="block">
                  <p className="text-keio-700 dark:text-keio-300 text-sm underline">
                    {entry.tag.target_type === 'daily_report'
                      ? formatDateLabel(entry.label)
                      : `${entry.label}（${formatDateTimeInTokyo(entry.tag.created_at)}）`}
                  </p>
                  {entry.body ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-[--color-muted]">{entry.body}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="直す" description="名前も大分類も、あとから自由に変えられます。" />
        <GoalEditForm goal={item.goal} categories={overview.categories} />
      </Card>

      <Card>
        <CardHeader
          title="まとめる・消す"
          description="似た目標を2つ作ってしまったときは、まとめると回数が残ります。"
        />
        <div className="space-y-3">
          <GoalMergeForm goal={item.goal} others={others} />
          <GoalDeleteButton goalId={item.goal.id} />
        </div>
      </Card>
    </div>
  );
}
