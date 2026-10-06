-- Чек-лист «в течение дня» (аналогично открытию и закрытию)

-- таблица задач дня (одна на seller_id/день)
create table if not exists public.day_tasks (
  id uuid primary key default gen_random_uuid(),
  spot_id text,
  spot_address text,
  shift_date text not null, -- YYYY-MM-DD
  seller_id text not null,
  seller_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint day_tasks_seller_date_unique unique (seller_id, shift_date)
);

-- пункты чек-листа дня
create table if not exists public.day_checklist_items (
  id uuid primary key default gen_random_uuid(),
  day_task_id uuid not null references public.day_tasks (id) on delete cascade,
  item_order integer not null,
  item_text text not null,
  is_checked boolean not null default false,
  checked_at timestamptz,
  checked_by text,
  created_at timestamptz not null default now()
);

-- уведомления админам о завершении дневного чек-листа
create table if not exists public.day_notifications (
  id uuid primary key default gen_random_uuid(),
  day_task_id uuid not null references public.day_tasks (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- индексы
create index if not exists idx_day_tasks_seller_date on public.day_tasks (seller_id, shift_date);
create index if not exists idx_day_tasks_completed on public.day_tasks (completed_at) where completed_at is not null;
create index if not exists idx_day_checklist_task on public.day_checklist_items (day_task_id, item_order);
create index if not exists idx_day_notifications_admin on public.day_notifications (admin_id, is_read);

-- RLS policies
alter table public.day_tasks enable row level security;
alter table public.day_checklist_items enable row level security;
alter table public.day_notifications enable row level security;

create policy "day_tasks_staff_select"
  on public.day_tasks for select
  using (public.current_role() in ('admin', 'barista'));

create policy "day_tasks_staff_write"
  on public.day_tasks for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

create policy "day_checklist_staff_select"
  on public.day_checklist_items for select
  using (public.current_role() in ('admin', 'barista'));

create policy "day_checklist_staff_write"
  on public.day_checklist_items for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

create policy "day_notifications_admin_select"
  on public.day_notifications for select
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

create policy "day_notifications_insert"
  on public.day_notifications for insert
  with check (public.current_role() in ('admin', 'barista'));

create policy "day_notifications_admin_update"
  on public.day_notifications for update
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

-- realtime для уведомлений админам
alter publication supabase_realtime add table public.day_notifications;
