create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Report',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_reports_user_created
  on public.saved_reports (user_id, created_at desc);

alter table public.saved_reports enable row level security;

drop policy if exists "saved_reports_select_own" on public.saved_reports;
create policy "saved_reports_select_own"
on public.saved_reports
for select
using (auth.uid() = user_id);

drop policy if exists "saved_reports_insert_own" on public.saved_reports;
create policy "saved_reports_insert_own"
on public.saved_reports
for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_reports_update_own" on public.saved_reports;
create policy "saved_reports_update_own"
on public.saved_reports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "saved_reports_delete_own" on public.saved_reports;
create policy "saved_reports_delete_own"
on public.saved_reports
for delete
using (auth.uid() = user_id);

