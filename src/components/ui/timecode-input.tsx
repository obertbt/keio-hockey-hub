'use client';

import { useState } from 'react';

import { TextInput } from '@/components/ui/field';
import { formatSecondsToTimecode, parseTimecodeToSeconds } from '@/lib/storage/validation';

/**
 * 動画の再生位置を入れる欄。
 *
 * **数字キーパッドには `:` が無い。**
 * それを知らずに `inputMode="numeric"` を指定していたため、
 * スマートフォンから時刻を入れられなかった。
 *
 * 区切りを打たなくてよいことにしたので、キーパッドは数字のままでよい。
 * ただし「1234 と打つと 12:34 になる」は、言われないと分からない。
 * **打った先から、どう読まれたかを出す。** 迷いをその場で消す。
 */
export function TimecodeInput({
  id,
  name,
  required,
  defaultValue,
  placeholder = '1234',
}: {
  id: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(defaultValue ?? '');
  const seconds = parseTimecodeToSeconds(raw);
  const touched = raw.trim() !== '';

  return (
    <div className="space-y-1">
      <TextInput
        id={id}
        name={name}
        required={required}
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        placeholder={placeholder}
        // 数字キーパッドを出す。区切りは打たなくてよい。
        inputMode="numeric"
        autoComplete="off"
      />
      {touched ? (
        seconds === null ? (
          <p role="alert" className="text-xs text-red-600">
            読み取れませんでした。時計の表示のまま、数字だけで入れてください（例: 1234 → 12:34）。
          </p>
        ) : (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {formatSecondsToTimecode(seconds)} として登録します
          </p>
        )
      ) : (
        <p className="text-xs text-[--color-muted]">数字だけでかまいません（1234 → 12:34）</p>
      )}
    </div>
  );
}
