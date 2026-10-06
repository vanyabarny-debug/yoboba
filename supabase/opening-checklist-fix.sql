-- Исправление схемы: задача открытия привязана к seller_id, а не к spot_id
-- spot_id появляется позже, когда бариста открывает смену

-- Удалить старый unique constraint
alter table public.opening_tasks drop constraint if exists opening_tasks_spot_id_shift_date_key;

-- Сделать spot_id nullable (до открытия смены его нет)
alter table public.opening_tasks alter column spot_id drop not null;

-- Сделать seller_id обязательным
alter table public.opening_tasks alter column seller_id set not null;

-- Добавить unique constraint по seller_id + shift_date (один чек-лист открытия на продавца в день)
alter table public.opening_tasks add constraint opening_tasks_seller_date_unique unique (seller_id, shift_date);

-- Добавить индекс для поиска по seller_id
create index if not exists idx_opening_tasks_seller_date on public.opening_tasks (seller_id, shift_date);
