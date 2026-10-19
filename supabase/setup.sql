-- Paste this entire file into the Supabase SQL Editor and Run.
-- Application keys never bypass these policies. No service_role key is used by the browser.
begin;
create table if not exists public.driveos_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint driveos_state_shape check (
    jsonb_typeof(state) = 'object' and
    jsonb_typeof(state -> 'cars') = 'array' and
    jsonb_typeof(state -> 'leads') = 'array' and
    jsonb_typeof(state -> 'posts') = 'array' and
    jsonb_typeof(state -> 'deals') = 'array' and
    state ?& array['cars', 'leads', 'posts', 'deals']
  ),
  constraint driveos_state_size check (octet_length(state::text) <= 8388608)
);
alter table public.driveos_workspaces enable row level security;
drop policy if exists driveos_select_own on public.driveos_workspaces;
drop policy if exists driveos_insert_own on public.driveos_workspaces;
drop policy if exists driveos_update_own on public.driveos_workspaces;
create policy driveos_select_own on public.driveos_workspaces for select to authenticated using ((select auth.uid()) = owner_id);
create policy driveos_insert_own on public.driveos_workspaces for insert to authenticated with check ((select auth.uid()) = owner_id and version = 1);
create policy driveos_update_own on public.driveos_workspaces for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
revoke all on public.driveos_workspaces from public, anon, authenticated;
grant select, insert on public.driveos_workspaces to authenticated;
grant update(state) on public.driveos_workspaces to authenticated;
create or replace function public.driveos_bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists driveos_version on public.driveos_workspaces;
create trigger driveos_version before update on public.driveos_workspaces for each row execute function public.driveos_bump_version();
revoke all on function public.driveos_bump_version() from public;
commit;
