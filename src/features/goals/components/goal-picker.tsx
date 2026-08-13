'use client';

import { useState } from 'react';

/**
 * 「今日はどの目標に取り組んだか」を選ぶ（0026）。
 *
 * 押すだけ。打たせない。名前を打たせると表記がゆれて、
 * あとから同じ目標としてまとめられなくなる。
 *
 * 出すのは**取り組み中のものだけ**を、しばらく触れていない順に。
 * よく使う順にすると、同じ目標ばかりに寄っていく。
 *
 * **大分類ごとに分けて出す。** 目標だけを平らに並べると、
 * 自分で書いた言葉なのに、どれがどの話か分からなくなる。
 * 見出しがあると「守備のことを何も選んでいない」にも気づける。
 *
 * 選ばなくても保存できる。選ばせるために止めると、日報が出なくなる。
 */
/** 大分類を決めていない目標の見出し。goals.ts の UNSORTED_LABEL と揃える。 */
const UNSORTED = 'まだ分けていない';

export interface PickableGoal {
  id: string;
  name: string;
  categoryName: string | null;
}

export function GoalPicker({
  goals,
  selectedIds = [],
  label = '今日取り組んだこと',
  hint = '選ばなくても構いません。あとから付け直せます。',
  emptyHref = '/goals',
}: {
  goals: PickableGoal[];
  selectedIds?: string[];
  label?: string;
  hint?: string;
  emptyHref?: string;
}) {
  const [selected, setSelected] = useState<string[]>(selectedIds);

  if (goals.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[--color-muted]">
          目標をまだ書いていません。
          <a href={emptyHref} className="text-keio-700 dark:text-keio-300 ml-1 underline">
            自分の目標を書く
          </a>
        </p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  // 大分類ごとにまとめる。並び順は渡された順のまま
  // （しばらく触れていない順。ここで並べ替えると、その意図が消える）。
  const groups: { name: string; goals: PickableGoal[] }[] = [];
  for (const goal of goals) {
    const name = goal.categoryName ?? UNSORTED;
    const found = groups.find((group) => group.name === name);
    if (found) found.goals.push(goal);
    else groups.push({ name, goals: [goal] });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="mb-1 text-xs font-medium text-[--color-muted]">{group.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.goals.map((goal) => {
                const active = selected.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => toggle(goal.id)}
                    aria-pressed={active}
                    className={`min-h-9 rounded-full border px-3 text-xs ${
                      active
                        ? 'border-action-500 bg-action-500/15 text-action-700 dark:text-action-400 font-medium'
                        : 'border-[--color-border] text-[--color-muted]'
                    }`}
                  >
                    {goal.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 選んだものだけを送る。フォームの一部として、日報と一緒に保存される。 */}
      {selected.map((id) => (
        <input key={id} type="hidden" name="goal_ids" value={id} />
      ))}

      <p className="text-xs text-[--color-muted]">{hint}</p>
    </div>
  );
}
