import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 認証をかける道と、かけない道（0028 で実際に詰まったところ）。
 *
 * ホーム画面に追加できなかった原因が、ここだった。
 *
 * Chrome は manifest.json を**ログイン情報を付けずに**取りに行く。
 * 認証の対象に入れたままだと、ログイン画面へ飛ばされ、
 * Chrome は JSON の代わりに HTML を受け取る。
 * manifest が読めないので「アプリ」と認識されず、
 * 「ショートカットを作成」しか出てこない。
 *
 * 見た目には何のエラーも出ないので、気づきにくい。
 * **実際に使う正規表現をそのまま読んで**確かめる。
 * ここを写して書くと、片方だけ直したときに気づけない。
 */

function matcherFromSource(): RegExp {
  const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8');

  // config.matcher に書いてある文字列を取り出す
  const found = source.match(/'(\/\(\(\?!.*?\).\*\))'/);
  if (!found?.[1]) throw new Error('proxy.ts から matcher を読み取れませんでした');

  // ソースの中では \\. と書いてあるが、実際の文字列としては \. になる。
  // ここをほどかないと、正規表現の意味が変わってしまう。
  const pattern = found[1].replace(/\\\\/g, '\\');

  return new RegExp(`^${pattern}$`);
}

describe('認証をかける道', () => {
  const matcher = matcherFromSource();

  it('普通の画面には認証をかける', () => {
    for (const path of ['/today', '/report', '/videos/abc', '/settings', '/admin/push']) {
      expect(matcher.test(path)).toBe(true);
    }
  });

  it('**manifest.json には認証をかけない**（かけると追加できなくなる）', () => {
    expect(matcher.test('/manifest.json')).toBe(false);
  });

  it('**sw.js にも認証をかけない**（かけると通知が登録できなくなる）', () => {
    expect(matcher.test('/sw.js')).toBe(false);
  });

  it('アイコンにも認証をかけない', () => {
    expect(matcher.test('/icon-192.png')).toBe(false);
    expect(matcher.test('/icon-512.png')).toBe(false);
    expect(matcher.test('/icon.svg')).toBe(false);
  });

  it('組み込みの静的ファイルは、これまでどおり外す', () => {
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
    expect(matcher.test('/favicon.ico')).toBe(false);
  });

  it('似た名前の画面は、外さない', () => {
    // /manifest.json は外すが、/manifest という画面を作ったら守る
    expect(matcher.test('/manifest')).toBe(true);
    expect(matcher.test('/sw')).toBe(true);
  });
});
