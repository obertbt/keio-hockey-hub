'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import {
  createGoal,
  deleteGoal,
  mergeGoals,
  toggleGoalAchieved,
  updateGoal,
  type GoalActionState,
} from '@/features/goals/actions';
import type { MemberGoalRow, SkillCategoryRow } from '@/types/database.types';

/**
 * 中目標の入力（0026）。
 *
 * 申請も承認もない。書いたらそれで登録される。
 * 「できるようになった」を押すのも本人。
 *
 * どれもあとから直せる。直せることが分かっていないと、
 * 最初の1つを書くのが重くなる。
 */

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block variant="action" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function CategorySelect({
  categories,
  defaultValue,
}: {
  categories: SkillCategoryRow[];
  defaultValue?: string | null;
}) {
  return (
    <Field label="大分類" htmlFor="skill_category_id" hint="決めなくても書けます。あとから移せます。">
      <Select id="skill_category_id" name="skill_category_id" defaultValue={defaultValue ?? ''}>
        <option value="">まだ分けていない</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** 新しく書く。 */
export function GoalCreateForm({ categories }: { categories: SkillCategoryRow[] }) {
  const [state, action] = useActionState<GoalActionState, FormData>(createGoal, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="action" block onClick={() => setOpen(true)}>
        目標を書く
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="目標" htmlFor="name" hint="自分の言葉で、ひとことで構いません">
        <TextInput id="name" name="name" required maxLength={100} placeholder="持ち出しを速くする" />
      </Field>

      <Field label="どうなったらできたと言えるか" htmlFor="note" hint="任意">
        <TextArea
          id="note"
          name="note"
          rows={2}
          maxLength={1000}
          placeholder="相手に寄せられる前に、前を向けたら"
        />
      </Field>

      <CategorySelect categories={categories} />

      <SubmitButton label="書く" pendingLabel="保存しています…" />
      <Button variant="ghost" block onClick={() => setOpen(false)}>
        やめる
      </Button>
    </form>
  );
}

/** 直す。名前も大分類も、あとから自由に変えられる。 */
export function GoalEditForm({ goal, categories }: { goal: MemberGoalRow; categories: SkillCategoryRow[] }) {
  const [state, action] = useActionState<GoalActionState, FormData>(updateGoal, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="goal_id" value={goal.id} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="目標" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={100} defaultValue={goal.name} />
      </Field>

      <Field label="どうなったらできたと言えるか" htmlFor="note" hint="任意">
        <TextArea id="note" name="note" rows={2} maxLength={1000} defaultValue={goal.note ?? ''} />
      </Field>

      <CategorySelect categories={categories} defaultValue={goal.skill_category_id} />

      <SubmitButton label="直す" pendingLabel="保存しています…" />
    </form>
  );
}

/**
 * 「できるようになった」。
 *
 * コーチの承認は要らない。押すのは本人。
 * 間違えて押しても、もう一度押せば戻る。
 */
export function AchievedToggle({ goal }: { goal: MemberGoalRow }) {
  const [state, action] = useActionState<GoalActionState, FormData>(toggleGoalAchieved, {});
  const done = goal.achieved_at !== null;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="goal_id" value={goal.id} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Button type="submit" block variant={done ? 'outline' : 'action'}>
        {done ? 'もう一度、取り組み中にする' : 'できるようになった'}
      </Button>
      {done ? null : (
        <p className="text-xs text-[--color-muted]">押すのはあなたです。コーチの承認は要りません。</p>
      )}
    </form>
  );
}

/**
 * まとめる（振り替え）。
 *
 * 「持ち出し」と「持ち出しを速く」を別々に作ってしまう、が必ず起きる。
 * 片方を消すと積み上がりが失われるので、移してから畳む。
 */
export function GoalMergeForm({
  goal,
  others,
}: {
  goal: MemberGoalRow;
  others: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<GoalActionState, FormData>(mergeGoals, {});
  const [open, setOpen] = useState(false);

  if (others.length === 0) return null;

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        ほかの目標にまとめる
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="from_goal_id" value={goal.id} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label="まとめ先"
        htmlFor="into_goal_id"
        hint="この目標に付いた記録が、まとめ先へ移ります。回数は失われません。"
      >
        <Select id="into_goal_id" name="into_goal_id" required defaultValue="">
          <option value="" disabled>
            選んでください
          </option>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton label="まとめる" pendingLabel="移しています…" />
      <Button variant="ghost" block onClick={() => setOpen(false)}>
        やめる
      </Button>
    </form>
  );
}

/** 消す。一度押しただけでは消さない。 */
export function GoalDeleteButton({ goalId }: { goalId: string }) {
  const [state, action] = useActionState<GoalActionState, FormData>(deleteGoal, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="goal_id" value={goalId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      {confirming ? (
        <>
          <p className="text-xs text-[--color-muted]">
            付けた記録も一緒に外れます。積み上がりを残したいときは、まとめてください。
          </p>
          <Button type="submit" variant="danger" size="sm">
            本当に消す
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          消す
        </Button>
      )}
    </form>
  );
}
