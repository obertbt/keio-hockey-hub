/**
 * サーバー側で起きた例外を受け取る（Next.js の onRequestError）。
 *
 * 画面には「表示できませんでした」としか出せない。
 * 中身を出すと DB の構造や設定が漏れるためで、それは変えない。
 *
 * かわりに、ここで受け止めて覚えておき、
 * /setup-check（設定を直す人しか見ない画面）でだけ見せる。
 *
 * これが無いと、原因を知る手段が置き場所のログだけになる。
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string },
  context: unknown,
): Promise<void> {
  // 覚え書きは Node の実行環境でしか持てない。Edge では何もしない。
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { recordError } = await import('@/lib/observability/last-errors');

  const digest =
    error && typeof error === 'object' && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : null;

  recordError({ path: request.path ?? '(不明)', digest, error });

  // 置き場所のログにも残す。見られる人はこちらのほうが確実。
  console.error('[keio-hockey-hub] サーバー側でエラー', { path: request.path, digest, error, context });
}
