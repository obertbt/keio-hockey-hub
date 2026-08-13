create or replace function app.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_membership uuid;
  v_admin_count      int;
  v_leaving_admin    boolean;
begin
  if new.role_code is not distinct from old.role_code
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  select id into v_actor_membership
  from public.team_members
  where team_id = old.team_id
    and profile_id = app.current_profile_id()
    and deleted_at is null;

  if new.role_code is distinct from old.role_code then
    if app.role_in_team(old.team_id) <> 'system_admin' then
      raise exception '役割を変えられるのは管理者だけです';
    end if;

    if v_actor_membership = old.id then
      raise exception '自分の役割は変えられません。他の管理者に頼んでください';
    end if;
  end if;

  v_leaving_admin :=
    old.role_code = 'system_admin'
    and old.status = 'active'
    and old.deleted_at is null
    and (
      new.role_code <> 'system_admin'
      or new.status <> 'active'
      or new.deleted_at is not null
    );

  if v_leaving_admin then
    select count(*) into v_admin_count
    from public.team_members
    where team_id = old.team_id
      and role_code = 'system_admin'
      and status = 'active'
      and deleted_at is null;

    if v_admin_count <= 1 then
      raise exception '最後の管理者です。先に別の管理者を決めてください';
    end if;
  end if;

  if new.role_code is distinct from old.role_code then
    insert into public.audit_logs
      (team_id, actor_id, action, target_table, target_id, summary, before_value, after_value)
    values (
      old.team_id, app.current_profile_id(), 'member.role_change', 'team_members', old.id,
      format('%s → %s', old.role_code, new.role_code),
      jsonb_build_object('role_code', old.role_code),
      jsonb_build_object('role_code', new.role_code)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_guard_role on public.team_members;
create trigger team_members_guard_role
  before update on public.team_members
  for each row execute function app.guard_member_role();

create or replace function app.log_member_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.member_permissions;
  v_team_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  select team_id into v_team_id from public.team_members where id = v_row.team_member_id;
  if v_team_id is null then
    return v_row;
  end if;

  insert into public.audit_logs
    (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_team_id, app.current_profile_id(),
    case when tg_op = 'DELETE' then 'member.permission_reset' else 'member.permission_change' end,
    'member_permissions', v_row.team_member_id,
    case
      when tg_op = 'DELETE' then format('%s を役割どおりに戻した', v_row.permission_code)
      when v_row.granted then format('%s を付与', v_row.permission_code)
      else format('%s を剥奪', v_row.permission_code)
    end
  );

  return v_row;
end;
$$;

drop trigger if exists member_permissions_log on public.member_permissions;
create trigger member_permissions_log
  after insert or update or delete on public.member_permissions
  for each row execute function app.log_member_permission();

create or replace function app.next_skill_sort_order(p_team_id uuid, p_category_id uuid, p_parent_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(sort_order), 0) + 1
  from public.skills
  where team_id = p_team_id
    and skill_category_id = p_category_id
    and parent_id is not distinct from p_parent_id
    and deleted_at is null;
$$;

revoke all on function app.next_skill_sort_order(uuid, uuid, uuid) from public;
grant execute on function app.next_skill_sort_order(uuid, uuid, uuid) to authenticated;
