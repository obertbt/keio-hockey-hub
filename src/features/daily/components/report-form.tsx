'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea } from '@/components/ui/field';
import { RatingField } from '@/components/ui/rating';
import { saveDailyReport, type DailyActionState } from '@/features/daily/actions';
import { describeDisclosure } from '@/features/daily/lib/disclosure';
import { GoalPicker, type PickableGoal } from '@/features/goals/components/goal-picker';
import { REPORT_VISIBILITY_LABELS } from '@/lib/labels';
import type { DailyReportRow, ReportVisibility } from '@/types/database.types';

/**
 * 質問と、呼びたいコーチ（0027）。
 *
 * 開いたときだけ出す。毎日ある欄ではないので、
 * 常に開いていると「何か聞かないといけない」に見える。
 */
function QuestionField({ coaches }: { coaches: CoachOption[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between rounded-lg border border-[--color-border] px-3 text-sm font-medium"
      >
        コーチに聞きたいことがある
        <span className="text-[--color-muted]">開く</span>
      </button>
    );
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-3 rounded-lg border border-[--color-border] p-3">
      <Field label="質問" htmlFor="question" hint="任意。書かなければ、何も起きません。">
        <TextArea
          id="question"
          name="question"
          rows={2}
          maxLength={2000}
          placeholder="持ち出しのとき、右足からのほうがいいですか"
        />
      </Field>

      {coaches.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">誰に聞くか</p>
          <div className="flex flex-wrap gap-1.5">
            {coaches.map((coach) => {
              const active = selected.includes(coach.teamMemberId);
              return (
                <button
                  key={coach.teamMemberId}
                  type="button"
                  onClick={() => toggle(coach.teamMemberId)}
                  aria-pressed={active}
                  className={`min-h-9 rounded-full border px-3 text-xs ${
                    active
                      ? 'border-action-500 bg-action-500/15 text-action-700 dark:text-action-400 font-medium'
                      : 'border-[--color-border] text-[--color-muted]'
                  }`}
                >
                  {coach.name}
                </button>
              );
            })}
          </div>
          {selected.map((id) => (
            <input key={id} type="hidden" name="question_member_ids" value={id} />
          ))}
          <p className="text-xs text-[--color-muted]">
            選ぶと、その人に知らせが届きます。選ばなくても、コーチの画面には出ます。
          </p>
        </div>
      ) : null}

      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[--color-muted] underline">
        閉じる
      </button>
    </div>
  );
}

function ActionButtons({ isSubmitted }: { isSubmitted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <Button type="submit" name="intent" value="submit" block size="lg" variant="action" disabled={pending}>
        {pending ? '保存しています…' : isSubmitted ? '提出内容を更新する' : '提出する'}
      </Button>
      <Button type="submit" name="intent" value="draft" block variant="outline" disabled={pending}>
        下書きとして保存
      </Button>
    </div>
  );
}

/**
 * 日報（16章 → 0027 で絞った）。
 *
 * 前は記述欄が10、段階評価が5あった。必須はひとつも無いのだが、
 * **並んでいるだけで「全部書くもの」に見える**。
 * 毎日のものなので、見えている量がそのまま負担になる（3章の7）。
 *
 * いま出しているのは8つだけ。
 *   中目標 / できたこと / 反省点 / 次回に向けた取り組み
 *   自己評価 / 疲労度 / 自由記述 / 質問
 *
 * **列は消していない。** 過去に書いたものは、詳細画面にそのまま出る。
 * 入力欄から外しただけ。
 */
export interface CoachOption {
  teamMemberId: string;
  name: string;
}

export function ReportForm({
  date,
  eventId,
  existing,
  goals,
  selectedGoalIds,
  coaches,
}: {
  date: string;
  eventId: string | null;
  existing: DailyReportRow | null;
  /** 選べる目標（0026）。取り組み中のものだけ。 */
  goals: PickableGoal[];
  /** すでに付いている目標。 */
  selectedGoalIds: string[];
  /** 質問で呼べるコーチ・スタッフ（0027）。 */
  coaches: CoachOption[];
}) {
  const [state, action] = useActionState<DailyActionState, FormData>(saveDailyReport, {});

  const isSubmitted = existing?.status === 'submitted';

  // 選んだその場で「何が伝わるか」を出す。
  // 「自分だけ」でも提出したことは伝わるので、それを黙っていない（0023）。
  const [visibility, setVisibility] = useState<ReportVisibility>(existing?.visibility ?? 'staff');

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="report_date" value={date} />
      <input type="hidden" name="event_id" value={eventId ?? ''} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {existing ? (
        <p className="text-sm">
          {isSubmitted ? <Badge tone="success">提出済み</Badge> : <Badge tone="warning">下書き</Badge>}
        </p>
      ) : null}

      {/*
        0026/0027: いちばん上は「今日どの目標に取り組んだか」。
        押すだけで済むものを先に置くと、書き始めが軽くなる。
      */}
      <GoalPicker goals={goals} selectedIds={selectedGoalIds} />

      <Field label="できたこと" htmlFor="what_went_well">
        <TextArea
          id="what_went_well"
          name="what_went_well"
          rows={3}
          defaultValue={existing?.what_went_well ?? ''}
          placeholder="3対2で、2回は前を向いてから運べた"
        />
      </Field>

      <Field label="反省点" htmlFor="what_went_wrong">
        <TextArea
          id="what_went_wrong"
          name="what_went_wrong"
          rows={3}
          defaultValue={existing?.what_went_wrong ?? ''}
        />
      </Field>

      <Field label="次回に向けた取り組み" htmlFor="next_action" hint="次の練習の目標にそのまま使えます">
        <TextArea id="next_action" name="next_action" rows={2} defaultValue={existing?.next_action ?? ''} />
      </Field>

      {/* --- 段階評価。0027 で2つに絞った --- */}
      <div className="space-y-4">
        <RatingField
          name="self_rating"
          label="自己評価"
          lowLabel="よくなかった"
          highLabel="とても良かった"
          defaultValue={existing?.self_rating ?? null}
        />
        <RatingField
          name="fatigue_level"
          label="疲労度"
          lowLabel="疲れていない"
          highLabel="とても疲れている"
          defaultValue={existing?.fatigue_level ?? null}
        />
      </div>

      <Field label="自由記述" htmlFor="free_note" hint="任意">
        <TextArea id="free_note" name="free_note" rows={3} defaultValue={existing?.free_note ?? ''} />
      </Field>

      {/*
        0027: 聞きたいことを、日報と同じ1回の操作で出す。
        別の画面へ行かせると、聞きたいことがあっても聞かれないまま終わる。

        呼ぶ相手を選ばなくても書ける。
        選ばなかったものは、コーチの「今日」の返事待ちに出る（0024 と同じ考え方）。
      */}
      <QuestionField coaches={coaches} />

      <Field
        label="公開範囲"
        htmlFor="visibility"
        hint={
          <>
            {describeDisclosure(visibility)}
            <br />
            初期値は「コーチまで」です。あとから変えられます。
          </>
        }
      >
        <Select
          id="visibility"
          name="visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as ReportVisibility)}
        >
          {Object.entries(REPORT_VISIBILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <ActionButtons isSubmitted={isSubmitted} />

      <p className="text-xs text-[--color-muted]">
        全部埋める必要はありません。ひとつでも書いてあれば提出できます。
      </p>
    </form>
  );
}
