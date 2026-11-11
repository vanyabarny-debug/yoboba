-- колокольчик: история уведомлений на 30 дней
-- выполнить один раз в sql editor проекта supabase

create table if not exists public.inbox_messages (
  id text primary key,
  title text not null,
  body text not null,
  emoji text,
  image text,
  href text,
  source text not null check (source in ('inbox', 'push')),
  created_at timestamptz not null default now()
);

create table if not exists public.inbox_receipts (
  message_id text not null references public.inbox_messages (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists idx_inbox_receipts_user_created
  on public.inbox_receipts (user_id, created_at desc);

create index if not exists idx_inbox_messages_created
  on public.inbox_messages (created_at);

alter table public.inbox_messages enable row level security;
alter table public.inbox_receipts enable row level security;

drop policy if exists "inbox_receipts_select_own" on public.inbox_receipts;
create policy "inbox_receipts_select_own"
  on public.inbox_receipts for select
  using (auth.uid() = user_id);

drop policy if exists "inbox_messages_select_own" on public.inbox_messages;
create policy "inbox_messages_select_own"
  on public.inbox_messages for select
  using (
    exists (
      select 1
      from public.inbox_receipts r
      where r.message_id = inbox_messages.id
        and r.user_id = auth.uid()
    )
  );

create or replace function public.prune_inbox()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.inbox_messages
  where created_at < now() - interval '30 days';
$$;
