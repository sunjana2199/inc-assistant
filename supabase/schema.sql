-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- Safe to run more than once.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_created_idx on public.messages (session_id, created_at);
create index if not exists sessions_user_created_idx on public.sessions (user_id, created_at desc);

alter table public.sessions enable row level security;
alter table public.messages enable row level security;

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all using (user_id = auth.uid());

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (session_id in (select id from public.sessions where user_id = auth.uid()));
