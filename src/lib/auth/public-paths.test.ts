import { describe, expect, it } from 'vitest';

import { destinationWithoutSession, isPublicPath, PUBLIC_PATHS } from '@/lib/auth/public-paths';

/**
 * 送り返し合いを起こさないこと（0029）。
 *
 * 一度これで**アプリが開かなくなった**（ERR_TOO_MANY_REDIRECTS）。
 *   proxy「ログイン済みだから /today へ」
 *   画面 「素性が取れないから /login へ」
 * 二人が別々の判断を持っていたのが原因。
 *
 * ここは、その2つが噛み合っていることを固定する。
 */
describe('公開の道', () => {
  it('ログイン画面は、ログインしていなくても開ける', () => {
    expect(isPublicPath('/login')).toBe(true);
  });

  it('**部員でない人の行き止まりは、公開の道にある**', () => {
    // ここが false になると、その人は永久に往復する
    expect(isPublicPath('/no-team')).toBe(true);
  });

  it('招待リンクは、その下の階層まで開ける', () => {
    expect(isPublicPath('/invite/abc123')).toBe(true);
  });

  it('中の画面は守る', () => {
    for (const path of ['/today', '/report', '/videos', '/settings', '/admin/audit']) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it('似た名前の画面は、開けてしまわない', () => {
    expect(isPublicPath('/logins')).toBe(false);
    expect(isPublicPath('/no-teams')).toBe(false);
  });
});

describe('素性が取れなかったときの行き先', () => {
  it('ログインしていなければ、ログイン画面へ', () => {
    expect(destinationWithoutSession(false)).toBe('/login');
  });

  it('**ログインできている人を、ログイン画面へ送らない**', () => {
    /*
      proxy は「ログイン済みの人が /login に来たら /today へ戻す」。
      ここで /login を返すと、その2つで往復が終わらなくなる。
    */
    expect(destinationWithoutSession(true)).not.toBe('/login');
  });

  it('行き先は、必ず公開の道である', () => {
    // 守られている道へ送ると、proxy がまた送り返す
    for (const isLoggedIn of [true, false]) {
      expect(isPublicPath(destinationWithoutSession(isLoggedIn))).toBe(true);
    }
  });
});

describe('公開の道そのもの', () => {
  it('すべて / で始まる（末尾に / は付けない）', () => {
    for (const path of PUBLIC_PATHS) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.endsWith('/')).toBe(false);
    }
  });
});
