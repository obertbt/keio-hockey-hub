import { z } from 'zod';

/**
 * 中目標の入力検証（0026）。
 *
 * 目標は自分の言葉で書くもの。形を細かく縛らない。
 * 断るのは「空」と「長すぎ」だけにする。
 */

const goalName = z
  .string()
  .trim()
  .min(1, '目標を書いてください。ひとことで構いません。')
  .max(100, '長すぎます（100文字まで）。短くすると、あとで探しやすくなります。');

const goalNote = z
  .string()
  .max(1000, '長すぎます（1000文字まで）。')
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  });

/** 大分類。決めずに書き始められる。 */
const categoryId = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? null : value.trim()))
  .refine((value) => value === null || z.guid().safeParse(value).success, {
    message: '大分類の指定が正しくありません。',
  });

export const memberGoalSchema = z.object({
  name: goalName,
  note: goalNote,
  skill_category_id: categoryId,
});

export type MemberGoalInput = z.infer<typeof memberGoalSchema>;

/** タグを付ける・外す。対象は日報か動画の書き込みのどちらか。 */
export const goalTagSchema = z.object({
  goal_ids: z.array(z.guid('目標の指定が正しくありません。')),
  target_type: z.enum(['daily_report', 'video_comment']),
  target_id: z.guid('対象の指定が正しくありません。'),
});

export const mergeGoalSchema = z.object({
  from_goal_id: z.guid('まとめる目標の指定が正しくありません。'),
  into_goal_id: z.guid('まとめ先の指定が正しくありません。'),
});
