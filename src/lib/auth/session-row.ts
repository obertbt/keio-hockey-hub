import type { PermissionOverrides } from '@/lib/auth/permissions';
import { isPermission } from '@/lib/auth/permissions';
import type { RoleCode } from '@/types/database.types';

/**
 * `current_session()`（0029）が返した jsonb を、画面が使う形に直す。
 *
 * 通信も DOM も触らない。ここだけ切り出してテストで固める。
 *
 * データベースから来たものでも、形は確かめる。
 * 足りないまま通すと、落ちるのはずっと後の別の場所になる。
 */
export interface SessionRow {
  userId: string;
  profileId: string;
  fullName: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  teamMemberId: string;
  role: RoleCode;
  overrides: PermissionOverrides;
}

export function parseSessionRow(value: unknown): SessionRow | null {
  // まだどのチームにも属していない人には null が返る。異常ではない。
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;

  const userId = text(row.user_id);
  const profileId = text(row.profile_id);
  const fullName = text(row.full_name);
  const teamId = text(row.team_id);
  const teamMemberId = text(row.team_member_id);
  const role = text(row.role);

  if (!userId || !profileId || !fullName || !teamId || !teamMemberId || !role) return null;

  return {
    userId,
    profileId,
    fullName,
    // 呼ばれたい名前が無い人は、本名で呼ぶ
    displayName: text(row.display_name) ?? fullName,
    email: text(row.email),
    avatarUrl: text(row.avatar_url),
    teamId,
    teamName: text(row.team_name) ?? '',
    teamMemberId,
    role: role as RoleCode,
    overrides: parseOverrides(row.overrides),
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * 個別に足された / 外された権限。
 *
 * 知らない権限名は捨てる。消した権限の行が残っていても、
 * それで画面が壊れないように。
 */
function parseOverrides(value: unknown): PermissionOverrides {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};

  const overrides: PermissionOverrides = {};
  for (const [code, granted] of Object.entries(value)) {
    if (isPermission(code) && typeof granted === 'boolean') {
      overrides[code] = granted;
    }
  }
  return overrides;
}
