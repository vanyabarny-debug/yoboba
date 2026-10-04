-- Система открытия смены с чек-листом
-- yoboba: выполнить в SQL Editor после schema.sql

-- таблица задач открытия (одна на точку/день)
create table if not exists public.opening_tasks (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null,
  spot_address text,
  shift_date text not null, -- YYYY-MM-DD
  seller_id text,
  seller_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (spot_id, shift_date)
);

-- пункты чек-листа открытия
create table if not exists public.opening_checklist_items (
  id uuid primary key default gen_random_uuid(),
  opening_task_id uuid not null references public.opening_tasks (id) on delete cascade,
  item_order integer not null,
  item_text text not null,
  is_checked boolean not null default false,
  checked_at timestamptz,
  checked_by text,
  created_at timestamptz not null default now()
);

-- уведомления админам о завершении открытия
create table if not exists public.opening_notifications (
  id uuid primary key default gen_random_uuid(),
  opening_task_id uuid not null references public.opening_tasks (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- индексы
create index if not exists idx_opening_tasks_spot_date on public.opening_tasks (spot_id, shift_date);
create index if not exists idx_opening_tasks_completed on public.opening_tasks (completed_at) where completed_at is not null;
create index if not exists idx_opening_checklist_task on public.opening_checklist_items (opening_task_id, item_order);
create index if not exists idx_opening_notifications_admin on public.opening_notifications (admin_id, is_read);

-- RLS policies
alter table public.opening_tasks enable row level security;
alter table public.opening_checklist_items enable row level security;
alter table public.opening_notifications enable row level security;

-- бариста и админы видят задачи открытия
create policy "opening_tasks_staff_select"
  on public.opening_tasks for select
  using (public.current_role() in ('admin', 'barista'));

-- бариста и админы могут создавать и обновлять задачи открытия
create policy "opening_tasks_staff_write"
  on public.opening_tasks for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

-- бариста и админы видят чек-листы
create policy "opening_checklist_staff_select"
  on public.opening_checklist_items for select
  using (public.current_role() in ('admin', 'barista'));

-- бариста и админы могут обновлять чек-листы
create policy "opening_checklist_staff_write"
  on public.opening_checklist_items for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

-- админы видят уведомления
create policy "opening_notifications_admin_select"
  on public.opening_notifications for select
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

-- только система может создавать уведомления
create policy "opening_notifications_insert"
  on public.opening_notifications for insert
  with check (public.current_role() in ('admin', 'barista'));

-- админы могут отмечать уведомления прочитанными
create policy "opening_notifications_admin_update"
  on public.opening_notifications for update
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

-- realtime для уведомлений админам
alter publication supabase_realtime add table public.opening_notifications;
