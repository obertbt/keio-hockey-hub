import 'server-only';

/**
 * 直近のサーバー側エラーを覚えておく（79章の運用）。
 *
 * なぜ要るか:
 *   本番では例外の中身を画面に出さない。正しい判断だが、
 *   そのぶん原因を知る手段が置き場所のログだけになる。
 *   タブレットしか持っていない相手に「ログを掘ってください」は通らない。
 *   実際にそれで何往復もした。
 *
 * ここに残したものを /setup-check で見せる。
 *
 * 断り:
 *   これは**その場しのぎの覚え書き**であって、記録ではない。
 *   置き場所は入れ替わるので、しばらく経つと消える。
 *   エラーを出した直後に見ること。
 *   ちゃんと残したいなら、監視サービスへ送るのが本筋（57章の宿題）。
 */

export interface RecordedError {
  at: string;
  path: string;
  digest: string | null;
  name: string;
  message: string;
  /** どこで落ちたか。先頭数行だけ。 */
  where: string;
}

/** 覚えておく数。多くしても読まない。 */
const LIMIT = 5;

// globalThis に置く。開発中の再読み込みや、束ね方の違いで
// 別々の入れ物になってしまうのを避ける。
const store = globalThis as typeof globalThis & { __khhErrors?: RecordedError[] };
store.__khhErrors ??= [];

export function recordError(input: { path: string; digest: string | null; error: unknown }): void {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));

  store.__khhErrors!.unshift({
    at: new Date().toISOString(),
    path: input.path,
    digest: input.digest,
    name: error.name,
    message: error.message,
    where: (error.stack ?? '').split('\n').slice(1, 4).join(' / ').trim(),
  });

  store.__khhErrors!.splice(LIMIT);
}

export function recentErrors(): RecordedError[] {
  return store.__khhErrors ?? [];
}
