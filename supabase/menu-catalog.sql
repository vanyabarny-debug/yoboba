-- постоянный каталог меню для сайта и админки
-- выполнить один раз в Supabase SQL Editor

create table if not exists public.menu_catalog (
  id text primary key,
  store jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.menu_catalog enable row level security;

-- приложение читает каталог через service_role, поэтому публичные политики не нужны
revoke all on public.menu_catalog from anon, authenticated;
grant all on table public.menu_catalog to service_role;

create or replace function public.set_menu_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists menu_catalog_updated_at on public.menu_catalog;
create trigger menu_catalog_updated_at
  before update on public.menu_catalog
  for each row execute function public.set_menu_catalog_updated_at();
