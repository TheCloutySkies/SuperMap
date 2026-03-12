-- SuperMap full schema — paste this entire file into Supabase Dashboard → SQL Editor → New query, then Run.
-- Order: 001 → 007 (saved_articles, saved_x_posts, user_updates, saved_places, delete_my_account, saved_place_lists, saved_reports, forum).

-- --- 001_saved_articles ---
create table if not exists public.saved_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text,
  source text,
  snippet text,
  saved_at timestamptz not null default now()
  unique(user_id, url)
);
create index if not exists saved_articles_user_id_idx on public.saved_articles(user_id);
alter table public.saved_articles enable row level security;
create policy "Users can read own saved_articles" on public.saved_articles for select using (auth.uid() = user_id);
create policy "Users can insert own saved_articles" on public.saved_articles for insert with check (auth.uid() = user_id);
create policy "Users can update own saved_articles" on public.saved_articles for update using (auth.uid() = user_id);
create policy "Users can delete own saved_articles" on public.saved_articles for delete using (auth.uid() = user_id);

-- --- 002_saved_x_posts_and_user_updates ---
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
create policy "saved_x_posts_select_own" on public.saved_x_posts for select using (auth.uid() = user_id);
drop policy if exists "saved_x_posts_insert_own" on public.saved_x_posts;
create policy "saved_x_posts_insert_own" on public.saved_x_posts for insert with check (auth.uid() = user_id);
drop policy if exists "saved_x_posts_delete_own" on public.saved_x_posts;
create policy "saved_x_posts_delete_own" on public.saved_x_posts for delete using (auth.uid() = user_id);
create table if not exists public.user_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.user_updates enable row level security;
drop policy if exists "user_updates_select_all_auth" on public.user_updates;
create policy "user_updates_select_all_auth" on public.user_updates for select using (auth.uid() is not null);
drop policy if exists "user_updates_insert_own" on public.user_updates;
create policy "user_updates_insert_own" on public.user_updates for insert with check (auth.uid() = user_id);

-- --- 003_saved_places_and_delete_account ---
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
create policy "saved_places_select_own" on public.saved_places for select using (auth.uid() = user_id);
drop policy if exists "saved_places_insert_own" on public.saved_places;
create policy "saved_places_insert_own" on public.saved_places for insert with check (auth.uid() = user_id);
drop policy if exists "saved_places_delete_own" on public.saved_places;
create policy "saved_places_delete_own" on public.saved_places for delete using (auth.uid() = user_id);
create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  delete from public.saved_articles where user_id = uid;
  delete from public.saved_x_posts where user_id = uid;
  delete from public.user_updates where user_id = uid;
  delete from public.saved_places where user_id = uid;
  delete from auth.users where id = uid;
  return true;
end; $$;
grant execute on function public.delete_my_account() to anon, authenticated;

-- --- 004_saved_place_lists ---
create table if not exists public.saved_place_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📂',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.saved_place_lists enable row level security;
drop policy if exists "saved_place_lists_select_own" on public.saved_place_lists;
create policy "saved_place_lists_select_own" on public.saved_place_lists for select using (auth.uid() = user_id);
drop policy if exists "saved_place_lists_insert_own" on public.saved_place_lists;
create policy "saved_place_lists_insert_own" on public.saved_place_lists for insert with check (auth.uid() = user_id);
drop policy if exists "saved_place_lists_update_own" on public.saved_place_lists;
create policy "saved_place_lists_update_own" on public.saved_place_lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saved_place_lists_delete_own" on public.saved_place_lists;
create policy "saved_place_lists_delete_own" on public.saved_place_lists for delete using (auth.uid() = user_id);
alter table public.saved_places add column if not exists list_id uuid references public.saved_place_lists(id) on delete set null;
alter table public.saved_place_lists add column if not exists icon text not null default '📂';

-- --- 005_saved_reports ---
create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Report',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_reports_user_created on public.saved_reports (user_id, created_at desc);
alter table public.saved_reports enable row level security;
drop policy if exists "saved_reports_select_own" on public.saved_reports;
create policy "saved_reports_select_own" on public.saved_reports for select using (auth.uid() = user_id);
drop policy if exists "saved_reports_insert_own" on public.saved_reports;
create policy "saved_reports_insert_own" on public.saved_reports for insert with check (auth.uid() = user_id);
drop policy if exists "saved_reports_update_own" on public.saved_reports;
create policy "saved_reports_update_own" on public.saved_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saved_reports_delete_own" on public.saved_reports;
create policy "saved_reports_delete_own" on public.saved_reports for delete using (auth.uid() = user_id);

-- --- 006_update_delete_account_for_reports ---
create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  delete from public.saved_articles where user_id = uid;
  delete from public.saved_x_posts where user_id = uid;
  delete from public.user_updates where user_id = uid;
  delete from public.saved_places where user_id = uid;
  delete from public.saved_reports where user_id = uid;
  delete from auth.users where id = uid;
  return true;
end; $$;
grant execute on function public.delete_my_account() to anon, authenticated;

-- --- 007_forum_system ---
create extension if not exists citext;
create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  created_at timestamptz not null default now()
);
insert into public.forum_categories (name) values
  ('Africa'),('Asia'),('Europe'),('North America'),('South America'),('Oceania'),('Antarctica'),
  ('Politics'),('Conflicts'),('Iran'),('Israel'),('U.S.A'),('UK'),('India'),('Pakistan'),('Middle East'),
  ('Ukraine'),('Russia'),('Ukraine War'),('Tech'),('Corruption'),('General'),('Predictions')
on conflict (name) do nothing;
create table if not exists public.category_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_name text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.forum_communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid not null references public.forum_categories(id) on delete restrict,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text,
  created_at timestamptz not null default now(),
  upvotes integer not null default 0
);
alter table public.forum_posts add column if not exists community_id uuid references public.forum_communities(id) on delete set null;
alter table public.forum_posts add column if not exists latitude double precision;
alter table public.forum_posts add column if not exists longitude double precision;
create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.forum_comments add column if not exists parent_id uuid references public.forum_comments(id) on delete cascade;
create table if not exists public.post_saved_links (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  saved_post_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, saved_post_id, user_id)
);
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_forum_communities_category on public.forum_communities(category_id);
create index if not exists idx_forum_posts_community_created on public.forum_posts(community_id, created_at desc);
create index if not exists idx_forum_comments_post_created on public.forum_comments(post_id, created_at asc);
alter table public.forum_categories enable row level security;
alter table public.category_requests enable row level security;
alter table public.forum_communities enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.post_saved_links enable row level security;
alter table public.user_profiles enable row level security;
drop policy if exists "forum_categories_select_all" on public.forum_categories;
create policy "forum_categories_select_all" on public.forum_categories for select to authenticated, anon using (true);
drop policy if exists "category_requests_select_own" on public.category_requests;
create policy "category_requests_select_own" on public.category_requests for select to authenticated using (auth.uid() = user_id);
drop policy if exists "category_requests_insert_own" on public.category_requests;
create policy "category_requests_insert_own" on public.category_requests for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "forum_communities_select_all" on public.forum_communities;
create policy "forum_communities_select_all" on public.forum_communities for select to authenticated, anon using (true);
drop policy if exists "forum_communities_insert_own" on public.forum_communities;
create policy "forum_communities_insert_own" on public.forum_communities for insert to authenticated with check (auth.uid() = creator_user_id);
drop policy if exists "forum_posts_select_all" on public.forum_posts;
create policy "forum_posts_select_all" on public.forum_posts for select to authenticated, anon using (true);
drop policy if exists "forum_posts_insert_own" on public.forum_posts;
create policy "forum_posts_insert_own" on public.forum_posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "forum_posts_update_own" on public.forum_posts;
create policy "forum_posts_update_own" on public.forum_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "forum_posts_delete_own" on public.forum_posts;
create policy "forum_posts_delete_own" on public.forum_posts for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "forum_comments_select_all" on public.forum_comments;
create policy "forum_comments_select_all" on public.forum_comments for select to authenticated, anon using (true);
drop policy if exists "forum_comments_insert_own" on public.forum_comments;
create policy "forum_comments_insert_own" on public.forum_comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "forum_comments_update_own" on public.forum_comments;
create policy "forum_comments_update_own" on public.forum_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "forum_comments_delete_own" on public.forum_comments;
create policy "forum_comments_delete_own" on public.forum_comments for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "post_saved_links_select_own" on public.post_saved_links;
create policy "post_saved_links_select_own" on public.post_saved_links for select to authenticated using (auth.uid() = user_id);
drop policy if exists "post_saved_links_insert_own" on public.post_saved_links;
create policy "post_saved_links_insert_own" on public.post_saved_links for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "post_saved_links_delete_own" on public.post_saved_links;
create policy "post_saved_links_delete_own" on public.post_saved_links for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "user_profiles_select_all" on public.user_profiles;
create policy "user_profiles_select_all" on public.user_profiles for select to authenticated, anon using (true);
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
