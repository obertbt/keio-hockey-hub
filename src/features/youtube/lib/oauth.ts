/**
 * Google の認証（チャンネル連携）。
 *
 * ここは URL の組み立てと形の確認だけ。通信はしない。テストで固める。
 *
 * 部の映像は限定公開なので、外から一覧を引けない。
 * チャンネルの持ち主が一度だけ許可を出すことで、取り込めるようになる。
 */

/** 動画の一覧を読むだけ。書き換えの権限は求めない。 */
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * 許可を求める画面の URL。
 *
 * `access_type=offline` と `prompt=consent` を付ける。
 * これが無いと更新トークンが返らず、
 * 「つないだのに翌日には動かない」になる。
 */
export function buildAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  /** 差し替えを防ぐための合言葉。 */
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/** 戻り先。設定ではなく、いま開いているアドレスから作る（招待リンクと同じ理由）。 */
export function redirectUriFor(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/youtube/callback`;
}

/**
 * 戻ってきた合言葉が、こちらが出したものか。
 *
 * 長さを見てから比べる。中身が違っても同じ時間で終わるようにしたいが、
 * ここは秘密ではなく使い捨ての合言葉なので、単純な一致で足りる。
 */
export function statesMatch(sent: string | undefined | null, received: string | undefined | null): boolean {
  if (!sent || !received) return false;
  if (sent.length !== received.length) return false;
  return sent === received;
}

/** Google から返る、鍵の受け渡しの中身。 */
export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * 受け取った中身が使えるか。
 *
 * **更新トークンが無いものは受け取らない。**
 * 2回目以降の許可では返らないことがあり、それを黙って保存すると
 * 「つないだつもりで、次から動かない」状態になる。
 */
export function readTokenResponse(body: TokenResponse): { refreshToken: string } | { error: string } {
  if (body.error) {
    return { error: body.error_description ?? body.error };
  }
  if (!body.refresh_token) {
    return {
      error:
        '更新トークンが返りませんでした。Google アカウントの「サードパーティ アプリとサービス」からこのアプリの許可を取り消してから、もう一度お試しください。',
    };
  }
  return { refreshToken: body.refresh_token };
}

/**
 * 記録に残してよい形にする。
 *
 * **鍵そのものはログに出さない**（75章）。
 * 何が起きたかは分かるが、値は分からない、という粒度にする。
 */
export function describeToken(token: string | null | undefined): string {
  if (!token) return '（無し）';
  return `${token.length}文字の鍵`;
}
