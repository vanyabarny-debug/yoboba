-- Гео при старте открытия + снова одна задача на точку/день (без переоткрытий)
-- yoboba: выполнить в SQL Editor

alter table public.opening_tasks
  add column if not exists open_geo jsonb;

comment on column public.opening_tasks.open_geo is
  'GPS устройства в момент нажатия «начать открытие»';

-- вернуть уникальность на точку+день (fix раньше увёл на seller+день)
alter table public.opening_tasks drop constraint if exists opening_tasks_seller_date_unique;
alter table public.opening_tasks drop constraint if exists opening_tasks_spot_id_shift_date_key;

-- spot_id снова обязателен для новых строк; старые null оставляем
-- unique только когда spot_id задан
create unique index if not exists opening_tasks_spot_date_unique
  on public.opening_tasks (spot_id, shift_date)
  where spot_id is not null;
