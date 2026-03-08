-- Run this in the Supabase SQL editor (Dashboard → SQL Editor) to create the saved_articles table.
-- Enable Row Level Security (RLS) so users only see their own rows.

create table if not exists public.saved_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text,
  source text,
  snippet text,
  saved_at timestamptz not null default now(),
  unique(user_id, url)
);

create index if not exists saved_articles_user_id_idx on public.saved_articles(user_id);

alter table public.saved_articles enable row level security;

create policy "Users can read own saved_articles"
  on public.saved_articles for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved_articles"
  on public.saved_articles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved_articles"
  on public.saved_articles for update
  using (auth.uid() = user_id);

create policy "Users can delete own saved_articles"
  on public.saved_articles for delete
  using (auth.uid() = user_id);
