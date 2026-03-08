create extension if not exists "pgcrypto";

create table if not exists public.saved_x_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  account text,
  title text,
  content text,
  posted_at timestamptz,
  saved_at timestamptz not null default now(),
  unique (user_id, url)
);

alter table public.saved_x_posts enable row level security;

drop policy if exists "saved_x_posts_select_own" on public.saved_x_posts;
create policy "saved_x_posts_select_own"
on public.saved_x_posts
for select
using (auth.uid() = user_id);

drop policy if exists "saved_x_posts_insert_own" on public.saved_x_posts;
create policy "saved_x_posts_insert_own"
on public.saved_x_posts
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_x_posts_delete_own" on public.saved_x_posts;
create policy "saved_x_posts_delete_own"
on public.saved_x_posts
for delete
using (auth.uid() = user_id);

create table if not exists public.user_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.user_updates enable row level security;

drop policy if exists "user_updates_select_all_auth" on public.user_updates;
create policy "user_updates_select_all_auth"
on public.user_updates
for select
using (auth.uid() is not null);

drop policy if exists "user_updates_insert_own" on public.user_updates;
create policy "user_updates_insert_own"
on public.user_updates
for insert
with check (auth.uid() = user_id);

