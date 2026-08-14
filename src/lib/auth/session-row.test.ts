import { describe, expect, it } from 'vitest';

import { parseSessionRow } from '@/lib/auth/session-row';

/**
 * `current_session()` の戻りを読む（0029）。
 *
 * ここが壊れると**全員がログイン画面へ飛ぶ**。
 * 3回の問い合わせを1回にまとめた代わりに、
 * 形の確認はこちらの責任になった。
 */

const full = {
  user_id: '11111111-1111-1111-1111-111111111111',
  profile_id: '22222222-2222-2222-2222-222222222222',
  full_name: '慶應 花子',
  display_name: 'はなこ',
  email: 'hanako@example.com',
  avatar_url: 'https://example.com/a.png',
  team_id: '33333333-3333-3333-3333-333333333333',
  team_name: '女子ホッケー部',
  team_member_id: '44444444-4444-4444-4444-444444444444',
  role: 'player',
  overrides: {},
};

describe('parseSessionRow', () => {
  it('そろっていれば、そのまま読める', () => {
    const session = parseSessionRow(full);

    expect(session?.profileId).toBe('22222222-2222-2222-2222-222222222222');
    expect(session?.displayName).toBe('はなこ');
    expect(session?.teamName).toBe('女子ホッケー部');
    expect(session?.role).toBe('player');
  });

  it('まだチームに属していない人には null が返る（異常ではない）', () => {
    expect(parseSessionRow(null)).toBeNull();
  });

  it('呼ばれたい名前が無い人は、本名で呼ぶ', () => {
    const session = parseSessionRow({ ...full, display_name: null });
    expect(session?.displayName).toBe('慶應 花子');
  });

  it('メールも写真も無い人がいる。空でも通す', () => {
    const session = parseSessionRow({ ...full, email: null, avatar_url: null });
    expect(session?.email).toBeNull();
    expect(session?.avatarUrl).toBeNull();
  });

  it('個別に足された/外された権限を読む', () => {
    const session = parseSessionRow({
      ...full,
      overrides: { 'video.upload': true, 'report.view_all': false },
    });

    expect(session?.overrides['video.upload']).toBe(true);
    expect(session?.overrides['report.view_all']).toBe(false);
  });

  it('知らない権限名は捨てる。消した権限の行が残っていても壊れない', () => {
    const session = parseSessionRow({
      ...full,
      overrides: { 'skill.approve': true, 'video.upload': true },
    });

    expect(session?.overrides).toEqual({ 'video.upload': true });
  });

  it('true / false 以外が入っていたら、その1件だけ捨てる', () => {
    const session = parseSessionRow({ ...full, overrides: { 'video.upload': 'yes' } });
    expect(session?.overrides).toEqual({});
  });

  /*
    ここから下は「欠けていたら通さない」こと。

    足りないまま通すと、落ちるのはずっと後の別の場所になる。
    team_id が空のまま画面まで届くと、
    誰のものでもないデータを引きにいく形になってしまう。
  */
  for (const missing of ['user_id', 'profile_id', 'full_name', 'team_id', 'team_member_id', 'role']) {
    it(`${missing} が無ければ、通さない`, () => {
      expect(parseSessionRow({ ...full, [missing]: null })).toBeNull();
    });
  }

  it('空文字も「無い」として扱う', () => {
    expect(parseSessionRow({ ...full, team_id: '' })).toBeNull();
  });

  it('配列や文字列が返ってきても、落ちずに null を返す', () => {
    expect(parseSessionRow([])).toBeNull();
    expect(parseSessionRow('こんにちは')).toBeNull();
    expect(parseSessionRow(undefined)).toBeNull();
  });
});
