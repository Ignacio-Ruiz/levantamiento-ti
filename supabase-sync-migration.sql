begin;

alter table public.equipos
  add column if not exists sync_id uuid,
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.equipos
set sync_id = gen_random_uuid()
where sync_id is null;

alter table public.equipos
  alter column sync_id set default gen_random_uuid(),
  alter column sync_id set not null;

create unique index if not exists equipos_sync_id_key
  on public.equipos(sync_id);

create index if not exists equipos_user_id_idx
  on public.equipos(user_id);

alter table public.equipos enable row level security;

do $$
declare
  existing_policy record;
  id_sequence text;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'equipos'
  loop
    execute format('drop policy %I on public.equipos', existing_policy.policyname);
  end loop;

  id_sequence := pg_get_serial_sequence('public.equipos', 'id');
  if id_sequence is not null then
    execute format('revoke all on sequence %s from anon, public', id_sequence);
    execute format('grant usage, select on sequence %s to authenticated', id_sequence);
  end if;
end $$;

revoke all on table public.equipos from anon, public;
grant select, insert, update, delete on table public.equipos to authenticated;

create policy equipos_select_own
  on public.equipos for select to authenticated
  using ((select auth.uid()) = user_id);

create policy equipos_insert_own
  on public.equipos for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy equipos_update_own
  on public.equipos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy equipos_delete_own
  on public.equipos for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
