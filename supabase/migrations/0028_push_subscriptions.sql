-- =============================================================
-- 0028_push_subscriptions.sql
-- スマートフォンに通知を届ける（Web Push）。
--
-- これまでの通知はアプリの中だけだった。
-- 開かないと気づかないので、「見てもらえた」がなかなか成立しない。
-- ロック画面に出るようにする。
--
-- なぜ Web Push を選んだか（3章の10・11）:
--   * 特定の会社に依存しない。ブラウザの標準の仕組み
--   * 通数の制限も課金もない。部の予算で止まることがない
--   * 送る鍵（VAPID）は自分たちで作る。誰かの審査を待たない
--
--   LINE は学生がいちばん見るが、公式アカウントの開設と
--   全員の友だち追加が要り、無料は月200通まで。
--   （LINE Notify は 2025-03 で終了しているので使えない）
--
-- iPhone の制約:
--   **ホーム画面に追加していないと届かない。** Safari で開いただけでは駄目。
--   Android は追加なしで届く。
--   これはこちらでは変えられないので、画面で案内する。
--
-- -------------------------------------------------------------
-- ここに入るものは「その端末へ通知を送れる鍵」
--
-- endpoint + p256dh + auth の3つが揃うと、**その端末に
-- 通知を出せてしまう**。パスワードほどではないが、鍵に近い。
--
--   * 本人以外に読ませない（他人の端末へ送れてしまう）
--   * 送るのはサーバだけ。画面には返さない
--   * 消すのは本人（と、期限切れを片付けるサーバ）
-- =============================================================

create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,

  -- 送り先。ブラウザが発行する URL。端末ごとに違う。
  endpoint       text not null,
  -- 中身を暗号化するための鍵。ブラウザが発行する。
  p256dh         text not null,
  auth           text not null,

  -- どの端末か、人が見て分かるように（「iPhone の Safari」など）。
  -- 消すときに、どれを消すのかが分からないと選べない。
  label          text,

  -- 最後に送れた時刻。掃除の判断に使う。
  last_success_at timestamptz,
  -- 続けて失敗した回数。一定を超えたら畳む。
  failure_count  int not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- 同じ端末を二重に登録しない。
  -- 登録し直すたびに増えると、同じ通知が何度も鳴る。
  unique (endpoint)
);

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (team_member_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- 参照先の筋を通す（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員には登録できません';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_validate on public.push_subscriptions;
create trigger push_subscriptions_validate
  before insert or update on public.push_subscriptions
  for each row execute function app.validate_push_subscription();

-- -------------------------------------------------------------
-- 誰に見えるか
--
-- **本人だけ。** コーチにも管理者にも見せない。
-- 見えたところで使い道が無く、他人の端末へ通知を送る材料になるだけ。
-- -------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_team_member(team_id) and app.is_own_member(team_member_id));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- -------------------------------------------------------------
-- 送り先を取り出す
--
-- 送るのはサーバ（service role）。
-- **画面からは呼べない。** 他人の鍵を引けてしまうため、
-- authenticated には実行権限を与えない。
-- -------------------------------------------------------------
create or replace function public.list_push_targets(p_team_member_ids uuid[])
returns table (
  subscription_id uuid,
  team_member_id  uuid,
  endpoint        text,
  p256dh          text,
  auth            text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.team_member_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.team_member_id = any(p_team_member_ids);
$$;

revoke all on function public.list_push_targets(uuid[]) from public;
-- authenticated には渡さない。service role だけが呼ぶ。

-- -------------------------------------------------------------
-- 届かなくなった端末を片付ける
--
-- 端末を初期化したりアプリを消したりすると、送り先は消える。
-- 放っておくと、送るたびに失敗し続ける。
--
-- 送る側が 404/410 を受け取ったらすぐ消す。
-- それ以外の失敗（通信の不調など）は数えるだけにして、
-- 続けて失敗したときだけ畳む。1回の不調で消すと、
-- 電波の悪い場所にいただけの人が通知を受け取れなくなる。
-- -------------------------------------------------------------
create or replace function public.drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.drop_push_subscription(text) from public;

create or replace function public.record_push_result(p_endpoint text, p_ok boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_subscriptions
  set last_success_at = case when p_ok then now() else last_success_at end,
      failure_count   = case when p_ok then 0 else failure_count + 1 end
  where endpoint = p_endpoint;
$$;

revoke all on function public.record_push_result(text, boolean) from public;
