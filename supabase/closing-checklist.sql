-- Система закрытия смены с чек-листом (аналогично открытию)

-- таблица задач закрытия (одна на seller_id/день)
create table if not exists public.closing_tasks (
  id uuid primary key default gen_random_uuid(),
  spot_id text,
  spot_address text,
  shift_date text not null, -- YYYY-MM-DD
  seller_id text not null,
  seller_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint closing_tasks_seller_date_unique unique (seller_id, shift_date)
);

-- пункты чек-листа закрытия
create table if not exists public.closing_checklist_items (
  id uuid primary key default gen_random_uuid(),
  closing_task_id uuid not null references public.closing_tasks (id) on delete cascade,
  item_order integer not null,
  item_text text not null,
  is_checked boolean not null default false,
  checked_at timestamptz,
  checked_by text,
  created_at timestamptz not null default now()
);

-- уведомления админам о завершении закрытия
create table if not exists public.closing_notifications (
  id uuid primary key default gen_random_uuid(),
  closing_task_id uuid not null references public.closing_tasks (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- индексы
create index if not exists idx_closing_tasks_seller_date on public.closing_tasks (seller_id, shift_date);
create index if not exists idx_closing_tasks_completed on public.closing_tasks (completed_at) where completed_at is not null;
create index if not exists idx_closing_checklist_task on public.closing_checklist_items (closing_task_id, item_order);
create index if not exists idx_closing_notifications_admin on public.closing_notifications (admin_id, is_read);

-- RLS policies
alter table public.closing_tasks enable row level security;
alter table public.closing_checklist_items enable row level security;
alter table public.closing_notifications enable row level security;

-- бариста и админы видят задачи закрытия
create policy "closing_tasks_staff_select"
  on public.closing_tasks for select
  using (public.current_role() in ('admin', 'barista'));

-- бариста и админы могут создавать и обновлять задачи закрытия
create policy "closing_tasks_staff_write"
  on public.closing_tasks for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

-- бариста и админы видят чек-листы
create policy "closing_checklist_staff_select"
  on public.closing_checklist_items for select
  using (public.current_role() in ('admin', 'barista'));

-- бариста и админы могут обновлять чек-листы
create policy "closing_checklist_staff_write"
  on public.closing_checklist_items for all
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

-- админы видят уведомления
create policy "closing_notifications_admin_select"
  on public.closing_notifications for select
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

-- только система может создавать уведомления
create policy "closing_notifications_insert"
  on public.closing_notifications for insert
  with check (public.current_role() in ('admin', 'barista'));

-- админы могут отмечать уведомления прочитанными
create policy "closing_notifications_admin_update"
  on public.closing_notifications for update
  using (
    public.current_role() = 'admin'
    or auth.uid() = admin_id
  );

-- realtime для уведомлений админам
alter publication supabase_realtime add table public.closing_notifications;
