import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 記録に目標を付け直す本体（0026）。
 *
 * **ここは 'use server' に置かない。**
 * 'use server' から出した関数は外から直接呼べる。
 * 呼ぶ側（日報の保存・タグの付け替え）が認可を通したあとで使う。
 *
 * 「足す」ではなく「いまの状態に合わせる」。
 * 選び直したときに、外し忘れが残らない。
 */
export async function applyGoalTags(
  session: AppSession,
  input: {
    targetType: 'daily_report' | 'video_comment';
    targetId: string;
    goalIds: string[];
  },
): Promise<{ added: number; removed: number; error?: string }> {
  const column = input.targetType === 'daily_report' ? 'daily_report_id' : 'video_comment_id';
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('goal_tags')
    .select('id, member_goal_id')
    .eq(column, input.targetId)
    .eq('created_by', session.profileId);

  const current = new Set((existing ?? []).map((row) => row.member_goal_id));
  const wanted = new Set(input.goalIds);

  const toRemove = (existing ?? []).filter((row) => !wanted.has(row.member_goal_id));
  const toAdd = [...wanted].filter((goalId) => !current.has(goalId));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('goal_tags')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id),
      );
    if (error) return { added: 0, removed: 0, error: error.message };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('goal_tags').insert(
      toAdd.map((goalId) => ({
        team_id: session.teamId,
        member_goal_id: goalId,
        target_type: input.targetType,
        daily_report_id: input.targetType === 'daily_report' ? input.targetId : null,
        video_comment_id: input.targetType === 'video_comment' ? input.targetId : null,
        created_by: session.profileId,
      })),
    );
    if (error) return { added: 0, removed: toRemove.length, error: error.message };
  }

  return { added: toAdd.length, removed: toRemove.length };
}
