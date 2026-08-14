import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';
import { Check, ChevronRight, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { GoalCreateForm } from '@/features/goals/components/goal-forms';
import { describeActivity, type GoalGroup } from '@/features/goals/lib/goals';
import { getGoalOverview } from '@/features/goals/queries';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: '目標' };

/**
 * 自分の目標（0026）。
 *
 * 大分類はチームで固定。その下は**自分の言葉で書く**。
 * 申請も承認もない。書いたらそれで登録される。
 *
 * 見せるのは到達度（%）ではなく、**何回向き合ったか**。
 * 承認の数を追いかけると、承認されにくい目標を書かなくなる。
 */
export default async function GoalsPage() {
  const session = await requireSession();
  const overview = await getGoalOverview(session);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          ← 今日へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">目標</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          自分の言葉で書きます。コーチの承認は要りません。日報や動画に付けると、回数が積み上がります。
        </p>
      </header>

      <Card>
        <CardHeader title="いまの状態" icon={<Target size={16} aria-hidden />} />
        {overview.summary.total === 0 ? (
          <EmptyState>まだ目標がありません。下から書けます。</EmptyState>
        ) : (
          <>
            <p className="text-sm">
              取り組み中 {overview.summary.active}件 / できるようになった {overview.summary.achieved}件
            </p>
            <p className="mt-1 text-sm text-[--color-muted]">
              これまで {overview.summary.totalTags}回、記録に付けました。
            </p>
            {/*
              書いただけで止まっているものを、責めない言い方で出す。
              「まだ0件」と数だけ出すと、書かないほうが楽になる。
            */}
            {overview.summary.untouched > 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
                {overview.summary.untouched}件は、まだ一度も記録に付けていません。
                日報を書くときに選んでみてください。
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <GoalCreateForm categories={overview.categories} />
      </Card>

      {overview.groups.length === 0 ? (
        <Card>
          <EmptyState>大分類がまだ登録されていません。大分類が無くても目標は書けます。</EmptyState>
        </Card>
      ) : (
        overview.groups.map((group) => <GroupCard key={group.categoryId ?? 'none'} group={group} />)
      )}
    </div>
  );
}

function GroupCard({ group }: { group: GoalGroup }) {
  return (
    <Card>
      <CardHeader title={group.categoryName} />
      {group.goals.length === 0 ? (
        <EmptyState>ここにはまだ目標がありません。</EmptyState>
      ) : (
        <ul className="divide-y divide-[--color-border]">
          {group.goals.map((item) => (
            <li key={item.goal.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                href={`/goals/${item.goal.id}`}
                className="flex min-h-11 items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{item.goal.name}</span>
                    {item.goal.achieved_at === null ? null : (
                      <Badge tone="success">
                        <Check size={12} aria-hidden />
                        できた
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-[--color-muted]">{describeActivity(item)}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[--color-muted]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
