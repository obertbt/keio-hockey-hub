create or replace function app.validate_measurement_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.measurement_events where id = new.measurement_event_id;
  if v_team is null then
    raise exception '対象の測定会が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの測定会は参照できません';
  end if;

  select team_id into v_team from public.measurement_items where id = new.measurement_item_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの測定項目は参照できません';
  end if;

  select team_id into v_team from public.team_members where id = new.team_member_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  if new.value is null and (new.text_value is null or btrim(new.text_value) = '') then
    raise exception '測定の値が入っていません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_results_validate on public.measurement_results;
create trigger measurement_results_validate
  before insert or update on public.measurement_results
  for each row execute function app.validate_measurement_result();

create or replace function app.validate_measurement_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  if new.season_id is not null then
    select team_id into v_team from public.seasons where id = new.season_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのシーズンは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team from public.events where id = new.event_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_events_validate on public.measurement_events;
create trigger measurement_events_validate
  before insert or update on public.measurement_events
  for each row execute function app.validate_measurement_event();

create policy measurement_results_own_write on public.measurement_results
  for insert to authenticated
  with check (app.is_own_member(team_member_id) and app.is_team_member(team_id));

create policy measurement_results_own_update on public.measurement_results
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));
