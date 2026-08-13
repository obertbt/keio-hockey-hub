import type { MediaVisibility } from '@/types/database.types';

/**
 * 動画1本の公開範囲を、誰が変えてよいか。
 *
 * 29章の約束をそのまま持ち込む。
 * **コーチが一方的に「部内全員」へ広げることはできない。**
 *
 * 広げる側と狭める側で、重さが違う。
 *   * 広げる … 本人が見せたくなかったものが、全員に出る。取り返しがつかない
 *   * 狭める … 見えていたものが見えなくなる。困りはするが、元に戻せる
 *
 * だからコーチには「狭める」だけを許す。
 * 広げるのは、上げた本人だけ。
 *
 * 部のチャンネルから取り込んだ動画は、つないだスタッフが登録者になる。
 * つまりスタッフが本人なので、ここは自由に動かせる。
 * 選手が自分で上げた切り抜き（22章）だけが、本人の手に残る。
 */

export type VisibilityCheck = { ok: true } | { ok: false; reason: string };

export interface VisibilityChangeInput {
  current: MediaVisibility;
  next: MediaVisibility;
  /** その動画を登録した本人か。 */
  isOwner: boolean;
  /** コーチ・スタッフか。 */
  isStaff: boolean;
}

/** 「部内全員に見える」状態か。 */
export function isOpenToTeam(visibility: MediaVisibility): boolean {
  return visibility === 'team';
}

export function canChangeVideoVisibility(input: VisibilityChangeInput): VisibilityCheck {
  if (input.current === input.next) {
    return { ok: false, reason: 'すでにその公開範囲です。' };
  }

  // 上げた本人は、広げるのも狭めるのも自由
  if (input.isOwner) return { ok: true };

  if (!input.isStaff) {
    return { ok: false, reason: '公開範囲を変えられるのは、その動画を登録した人とスタッフだけです。' };
  }

  // ここから下はスタッフ。ただし本人ではない。
  if (isOpenToTeam(input.next)) {
    return {
      ok: false,
      reason:
        'ほかの人が上げた動画を、部内全員へ広げることはできません。上げた本人に開けてもらってください。',
    };
  }

  return { ok: true };
}

/** 画面と通知に出す言い方。 */
export const VIDEO_VISIBILITY_LABELS: Record<MediaVisibility, string> = {
  team: '部内全員',
  selected_members: '選んだ人だけ',
  private_staff: 'コーチとスタッフまで',
};
