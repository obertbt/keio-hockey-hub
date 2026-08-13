import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';

import { fetchAccessToken, fetchChannelVideos } from './client';
import { describePlan, planImport, type ExistingVideo } from './lib/mapping';
import { listConnectedTeams, loadConnection, recordSyncResult } from './store';

/**
 * チャンネルからの取り込み（24章の自動化）。
 *
 * **ここは 'use server' にしない。**
 * 'use server' から出した関数は、外から直接呼べてしまう。
 * 取り込み本体には認可の判断が入っていないので、
 * 呼べる場所を「認可を通したところ」だけに絞る（actions.ts と route）。
 *
 * 守ること:
 *   * 勝手に上書きしない（37章の取り込みと同じ約束）。
 *     人が直した題を、次の取り込みで戻さない。
 *   * 取り込んだものは部内全員に見せる（YouTube 側で既に見られるため）。
 *     部内だけに留めたいものは、動画ごとに手で狭められる。
 *   * 非公開の動画は引っ張ってこない。
 *   * 鍵はここから外に出さない。結果の文言にも載せない。
 */

/**
 * 取り込む。手で押すときも、定期実行から呼ぶときも、ここを通る。
 *
 * 定期実行にはログインが無いので、session ではなく
 * 「どのチームの、誰として入れるか」だけを受け取る。
 */
export async function syncChannel(target: {
  teamId: string;
  /** 取り込んだ動画の登録者。定期実行ではつないだ人にする。 */
  profileId: string;
}): Promise<{ message: string; error?: string }> {
  const session = target;
  const connection = await loadConnection(session.teamId);
  if (!connection) {
    return { message: '', error: 'チャンネルがつながっていません。先に接続してください。' };
  }

  try {
    const accessToken = await fetchAccessToken(connection.refreshToken);
    const fetched = await fetchChannelVideos(accessToken, connection.uploadsPlaylistId);

    // 定期実行にはログインが無い。RLS に頼れないので、
    // 対象を team_id で絞ったうえで service role を使う。
    const supabase = createAdminClient();
    const { data: existingRows } = await supabase
      .from('videos')
      .select('id, provider_video_id, title, duration_seconds, thumbnail_url')
      .eq('team_id', session.teamId)
      .eq('provider', 'youtube')
      .is('deleted_at', null);

    const existing: ExistingVideo[] = existingRows ?? [];
    const plan = planImport(fetched, existing);

    if (plan.create.length > 0) {
      const { error } = await supabase.from('videos').insert(
        plan.create.map((draft) => ({
          team_id: session.teamId,
          created_by: session.profileId,
          imported_from_channel: true,
          ...draft,
        })),
      );
      if (error) throw new Error(`取り込めませんでした: ${error.message}`);
    }

    for (const item of plan.update) {
      const { error } = await supabase.from('videos').update(item.patch).eq('id', item.id);
      if (error) throw new Error(`情報を補えませんでした: ${error.message}`);
    }

    let message = describePlan(plan);

    // 1本も見つからないときは、たいてい「つなぐチャンネルを選び間違えた」。
    // ブランドアカウントを持っていると、許可の画面で
    // 個人のチャンネルと部のチャンネルの選択が出る。
    // ここで黙って「0本」とだけ返すと、原因にたどり着けない。
    if (fetched.length === 0) {
      message =
        `「${connection.channelTitle ?? 'このチャンネル'}」に動画が見つかりませんでした。` +
        'つなぐチャンネルを間違えている可能性があります。' +
        '一度つなぎを解いて、Google の画面で部のチャンネルを選び直してください。';
    }

    await recordSyncResult(session.teamId, message);

    return { message };
  } catch (unexpected) {
    const reason = unexpected instanceof Error ? unexpected.message : String(unexpected);
    await recordSyncResult(session.teamId, `失敗: ${reason}`);
    return { message: '', error: reason };
  }
}

/**
 * つながっているチームを全部まわす。定期実行から呼ぶ。
 *
 * 1つ失敗しても、残りは続ける。
 * 1チームの不調で全部が止まるほうが困る。
 */
export async function syncAllChannels(): Promise<{ teamId: string; message: string; error?: string }[]> {
  const teams = await listConnectedTeams();
  const results: { teamId: string; message: string; error?: string }[] = [];

  for (const team of teams) {
    const result = await syncChannel({ teamId: team.teamId, profileId: team.connectedBy });
    results.push({ teamId: team.teamId, ...result });
  }

  return results;
}
