create extension if not exists citext;

create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  created_at timestamptz not null default now()
);

insert into public.forum_categories (name) values
  ('Africa'),
  ('Asia'),
  ('Europe'),
  ('North America'),
  ('South America'),
  ('Oceania'),
  ('Antarctica'),
  ('Politics'),
  ('Conflicts'),
  ('Iran'),
  ('Israel'),
  ('U.S.A'),
  ('UK'),
  ('India'),
  ('Pakistan'),
  ('Middle East'),
  ('Ukraine'),
  ('Russia'),
  ('Ukraine War'),
  ('Tech'),
  ('Corruption'),
  ('General'),
  ('Predictions')
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

alter table public.forum_posts
add column if not exists community_id uuid references public.forum_communities(id) on delete set null;

alter table public.forum_posts
add column if not exists latitude double precision;

alter table public.forum_posts
add column if not exists longitude double precision;

create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.forum_comments
add column if not exists parent_id uuid references public.forum_comments(id) on delete cascade;

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
create policy "forum_categories_select_all"
on public.forum_categories
for select
to authenticated, anon
using (true);

drop policy if exists "category_requests_select_own" on public.category_requests;
create policy "category_requests_select_own"
on public.category_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "category_requests_insert_own" on public.category_requests;
create policy "category_requests_insert_own"
on public.category_requests
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "forum_communities_select_all" on public.forum_communities;
create policy "forum_communities_select_all"
on public.forum_communities
for select
to authenticated, anon
using (true);

drop policy if exists "forum_communities_insert_own" on public.forum_communities;
create policy "forum_communities_insert_own"
on public.forum_communities
for insert
to authenticated
with check (auth.uid() = creator_user_id);

drop policy if exists "forum_posts_select_all" on public.forum_posts;
create policy "forum_posts_select_all"
on public.forum_posts
for select
to authenticated, anon
using (true);

drop policy if exists "forum_posts_insert_own" on public.forum_posts;
create policy "forum_posts_insert_own"
on public.forum_posts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "forum_posts_update_own" on public.forum_posts;
create policy "forum_posts_update_own"
on public.forum_posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "forum_posts_delete_own" on public.forum_posts;
create policy "forum_posts_delete_own"
on public.forum_posts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "forum_comments_select_all" on public.forum_comments;
create policy "forum_comments_select_all"
on public.forum_comments
for select
to authenticated, anon
using (true);

drop policy if exists "forum_comments_insert_own" on public.forum_comments;
create policy "forum_comments_insert_own"
on public.forum_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "forum_comments_update_own" on public.forum_comments;
create policy "forum_comments_update_own"
on public.forum_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "forum_comments_delete_own" on public.forum_comments;
create policy "forum_comments_delete_own"
on public.forum_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "post_saved_links_select_own" on public.post_saved_links;
create policy "post_saved_links_select_own"
on public.post_saved_links
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "post_saved_links_insert_own" on public.post_saved_links;
create policy "post_saved_links_insert_own"
on public.post_saved_links
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "post_saved_links_delete_own" on public.post_saved_links;
create policy "post_saved_links_delete_own"
on public.post_saved_links
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_profiles_select_all" on public.user_profiles;
create policy "user_profiles_select_all"
on public.user_profiles
for select
to authenticated, anon
using (true);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
