import { describe, expect, it } from 'vitest';

import { canChangeVideoVisibility, isOpenToTeam, VIDEO_VISIBILITY_LABELS } from './visibility';

/**
 * 29章の約束を、動画1本の公開範囲でも守れているか。
 *
 * いちばん守りたいのは
 * **コーチが一方的に「部内全員」へ広げられない**こと。
 * ここが崩れると、選手は自分の失敗を上げなくなる。
 */

describe('公開範囲を変えられる人', () => {
  it('上げた本人は広げられる', () => {
    expect(
      canChangeVideoVisibility({
        current: 'private_staff',
        next: 'team',
        isOwner: true,
        isStaff: false,
      }).ok,
    ).toBe(true);
  });

  it('上げた本人は狭められる', () => {
    expect(
      canChangeVideoVisibility({ current: 'team', next: 'private_staff', isOwner: true, isStaff: false }).ok,
    ).toBe(true);
  });

  it('**コーチは、ほかの人の動画を部内全員へ広げられない**', () => {
    const result = canChangeVideoVisibility({
      current: 'private_staff',
      next: 'team',
      isOwner: false,
      isStaff: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('上げた本人');
  });

  it('コーチは狭められる（取り下げは効くようにしておく）', () => {
    expect(
      canChangeVideoVisibility({ current: 'team', next: 'private_staff', isOwner: false, isStaff: true }).ok,
    ).toBe(true);
  });

  it('選んだ人だけ、へ狭めるのもコーチができる', () => {
    expect(
      canChangeVideoVisibility({
        current: 'team',
        next: 'selected_members',
        isOwner: false,
        isStaff: true,
      }).ok,
    ).toBe(true);
  });

  it('関係のない選手は触れない', () => {
    const result = canChangeVideoVisibility({
      current: 'team',
      next: 'private_staff',
      isOwner: false,
      isStaff: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('登録した人');
  });

  it('同じ値への変更は、押し間違いとして断る', () => {
    expect(canChangeVideoVisibility({ current: 'team', next: 'team', isOwner: true, isStaff: true }).ok).toBe(
      false,
    );
  });

  it('本人であれば、スタッフでなくても取り込み動画と同じ扱いになる', () => {
    // 部のチャンネルから取り込んだ動画は、つないだスタッフが登録者になる。
    // つまり「本人」の判定だけで足りる。
    expect(
      canChangeVideoVisibility({
        current: 'team',
        next: 'private_staff',
        isOwner: true,
        isStaff: true,
      }).ok,
    ).toBe(true);
  });
});

describe('言い方', () => {
  it('部内全員かどうかを見分ける', () => {
    expect(isOpenToTeam('team')).toBe(true);
    expect(isOpenToTeam('private_staff')).toBe(false);
    expect(isOpenToTeam('selected_members')).toBe(false);
  });

  it('画面に出す言葉が全部そろっている', () => {
    expect(VIDEO_VISIBILITY_LABELS.team).toBe('部内全員');
    expect(VIDEO_VISIBILITY_LABELS.private_staff).toBe('コーチとスタッフまで');
    expect(VIDEO_VISIBILITY_LABELS.selected_members).toBe('選んだ人だけ');
  });
});
