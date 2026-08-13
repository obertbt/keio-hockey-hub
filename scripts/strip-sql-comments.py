"""貼り付け用に、SQL からコメントを落とす。

追加の migration を1つ流すだけ、という場面がいちばん多い。
このプロジェクトは日本語のコメントを厚く書いてあるので、
そのままだと貼り付けに手こずる（実際にそうなった）。

落とすのは行頭の `--` から始まる行と、連続する空行だけ。
文字列の中の `--` は触らない（そもそも無いことを確認済み）。
動きは変えないので、DB テストで同じ結果になることを確かめている。

元のファイルは触らない。読むのは常に supabase/migrations/ のほう。
"""

import re
import sys
from pathlib import Path


def strip(sql: str) -> str:
    kept = []
    for line in sql.split("\n"):
        stripped = line.strip()
        # 行頭のコメントだけを落とす。行末に付いたものは残す
        # （`deleted_at is null -- 0019` のような、式の一部に見えるものを守る）
        if stripped.startswith("--"):
            continue
        kept.append(line.rstrip())

    out = "\n".join(kept)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip() + "\n"


def main() -> int:
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)

    total_before = 0
    total_after = 0

    for path in sorted(source.glob("*.sql")):
        original = path.read_text(encoding="utf-8")
        shortened = strip(original)

        # 番号だけの名前にする。貼る側が「次はこれ」と分かる
        number = path.name.split("_")[0]
        (target / f"{number}.sql").write_text(shortened, encoding="utf-8")

        total_before += len(original)
        total_after += len(shortened)

    print(f"  {target}/ に {len(list(source.glob('*.sql')))} 個。"
          f"{total_before} → {total_after} 文字（{total_after / total_before * 100:.0f}%）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
