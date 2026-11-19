-- Chạy trong Supabase → SQL Editor
create table if not exists public.ads_user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ads_user_state enable row level security;

create policy "own row select" on public.ads_user_state for select using (auth.uid() = user_id);
create policy "own row insert" on public.ads_user_state for insert with check (auth.uid() = user_id);
create policy "own row update" on public.ads_user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.ads_user_state for delete using (auth.uid() = user_id);
