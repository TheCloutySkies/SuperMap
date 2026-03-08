create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Pinned place',
  lat double precision not null,
  lon double precision not null,
  icon text not null default '📍',
  list_name text not null default 'General',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.saved_places enable row level security;

drop policy if exists "saved_places_select_own" on public.saved_places;
create policy "saved_places_select_own"
on public.saved_places
for select
using (auth.uid() = user_id);

drop policy if exists "saved_places_insert_own" on public.saved_places;
create policy "saved_places_insert_own"
on public.saved_places
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_places_delete_own" on public.saved_places;
create policy "saved_places_delete_own"
on public.saved_places
for delete
using (auth.uid() = user_id);

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.saved_articles where user_id = uid;
  delete from public.saved_x_posts where user_id = uid;
  delete from public.user_updates where user_id = uid;
  delete from public.saved_places where user_id = uid;
  delete from auth.users where id = uid;

  return true;
end;
$$;

grant execute on function public.delete_my_account() to anon, authenticated;
