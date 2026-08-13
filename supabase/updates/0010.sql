revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.roles from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
