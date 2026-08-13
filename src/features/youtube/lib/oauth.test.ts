import { describe, expect, it } from 'vitest';

import {
  buildAuthUrl,
  describeToken,
  readTokenResponse,
  redirectUriFor,
  statesMatch,
  YOUTUBE_SCOPE,
} from './oauth';

/**
 * チャンネル連携の入口。
 *
 * ここを間違えると「つないだのに翌日には動かない」になる。
 * 実際に起きやすいのは、更新トークンが返らない形で許可を求めてしまうこと。
 */

describe('許可を求める URL', () => {
  const base = {
    clientId: 'client-1',
    redirectUri: 'https://example.com/api/youtube/callback',
    state: 'abc',
  };

  it('**更新トークンが返る形で求める**', () => {
    const url = new URL(buildAuthUrl(base));
    // これが無いと、その場限りの鍵しか返らない
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('読むだけの権限しか求めない', () => {
    const url = new URL(buildAuthUrl(base));
    expect(url.searchParams.get('scope')).toBe(YOUTUBE_SCOPE);
    expect(YOUTUBE_SCOPE).toContain('readonly');
  });

  it('合言葉を持たせる（差し替えを防ぐ）', () => {
    const url = new URL(buildAuthUrl(base));
    expect(url.searchParams.get('state')).toBe('abc');
  });

  it('戻り先をそのまま渡す', () => {
    const url = new URL(buildAuthUrl(base));
    expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri);
  });
});

describe('戻り先の組み立て', () => {
  it('末尾のスラッシュがあっても二重にならない', () => {
    expect(redirectUriFor('https://example.com/')).toBe('https://example.com/api/youtube/callback');
    expect(redirectUriFor('https://example.com')).toBe('https://example.com/api/youtube/callback');
  });
});

describe('合言葉の照合', () => {
  it('同じなら通る', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
  });

  it('違えば通さない', () => {
    expect(statesMatch('abc', 'abd')).toBe(false);
    expect(statesMatch('abc', 'abcd')).toBe(false);
  });

  it('無いものは通さない（空同士も通さない）', () => {
    expect(statesMatch(null, 'abc')).toBe(false);
    expect(statesMatch('abc', undefined)).toBe(false);
    expect(statesMatch('', '')).toBe(false);
  });
});

describe('受け取った鍵の確認', () => {
  it('更新トークンがあれば受け取る', () => {
    const result = readTokenResponse({ refresh_token: '1//abc', access_token: 'ya29' });
    expect(result).toEqual({ refreshToken: '1//abc' });
  });

  it('**更新トークンが無いものは受け取らない**', () => {
    // 黙って保存すると「つないだつもりで、次から動かない」になる
    const result = readTokenResponse({ access_token: 'ya29' });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toContain('取り消して');
  });

  it('向こうの言い分をそのまま伝える', () => {
    const result = readTokenResponse({ error: 'invalid_grant', error_description: '期限切れです' });
    expect(result).toEqual({ error: '期限切れです' });
  });
});

describe('記録の残し方', () => {
  it('**鍵そのものは出さない**', () => {
    const token = '1//とても大事な鍵';
    const described = describeToken(token);
    expect(described).not.toContain('とても大事な鍵');
    expect(described).toContain('文字の鍵');
  });

  it('無いときも分かる形にする', () => {
    expect(describeToken(null)).toBe('（無し）');
  });
});
