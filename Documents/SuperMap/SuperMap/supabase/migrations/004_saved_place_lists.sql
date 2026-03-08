create table if not exists public.saved_place_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.saved_place_lists enable row level security;

drop policy if exists "saved_place_lists_select_own" on public.saved_place_lists;
create policy "saved_place_lists_select_own"
on public.saved_place_lists
for select
using (auth.uid() = user_id);

drop policy if exists "saved_place_lists_insert_own" on public.saved_place_lists;
create policy "saved_place_lists_insert_own"
on public.saved_place_lists
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_place_lists_update_own" on public.saved_place_lists;
create policy "saved_place_lists_update_own"
on public.saved_place_lists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_place_lists_delete_own" on public.saved_place_lists;
create policy "saved_place_lists_delete_own"
on public.saved_place_lists
for delete
using (auth.uid() = user_id);

alter table public.saved_places
add column if not exists list_id uuid references public.saved_place_lists(id) on delete set null;

