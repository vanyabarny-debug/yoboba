-- состояние финансов / склада / плана продаж
-- выполнить в Supabase SQL Editor (один раз)

create table if not exists public.finance_state (
  id text primary key,
  store jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_state enable row level security;

revoke all on public.finance_state from anon, authenticated;
grant all on table public.finance_state to service_role;

create or replace function public.set_finance_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_state_updated_at on public.finance_state;
create trigger finance_state_updated_at
  before update on public.finance_state
  for each row execute function public.set_finance_state_updated_at();

-- перенос из старой строки menu_catalog, если таблица уже жила там
insert into public.finance_state (id, store, updated_at)
select 'default', store, updated_at
from public.menu_catalog
where id = 'finance'
on conflict (id) do nothing;
