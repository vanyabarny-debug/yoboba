-- склад / касса / выдачи: отдельные таблицы в supabase
-- меню (menu_catalog.id = main) не трогаем
-- выполнить один раз в SQL Editor проекта

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

-- склад из menu_catalog.finance → finance_state.default
insert into public.finance_state (id, store, updated_at)
select 'default', store, updated_at
from public.menu_catalog
where id = 'finance'
on conflict (id) do nothing;

-- касса / журнал готовки / выдачи
insert into public.finance_state (id, store, updated_at)
select id, store, updated_at
from public.menu_catalog
where id in ('cash-transactions', 'prep-events', 'fulfillment-events', 'handed-orders')
on conflict (id) do nothing;

create table if not exists public.stock_audit (
  id text primary key,
  at timestamptz not null default now(),
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  material_id text,
  material_name text,
  qty_before numeric,
  qty_after numeric,
  note text,
  movement_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_audit_at on public.stock_audit (at desc);
create index if not exists idx_stock_audit_actor on public.stock_audit (actor_id, at desc);
create index if not exists idx_stock_audit_material on public.stock_audit (material_id, at desc);

alter table public.stock_audit enable row level security;

revoke all on public.stock_audit from anon, authenticated;
grant all on table public.stock_audit to service_role;

insert into public.stock_audit (
  id, at, actor_id, actor_name, actor_role, action,
  material_id, material_name, qty_before, qty_after, note, movement_id
)
select
  e->>'id',
  coalesce((e->>'at')::timestamptz, now()),
  coalesce(nullif(e->>'actorId', ''), nullif(e->>'actor_id', ''), 'unknown'),
  coalesce(nullif(e->>'actorName', ''), nullif(e->>'actor_name', ''), 'неизвестно'),
  coalesce(nullif(e->>'actorRole', ''), nullif(e->>'actor_role', ''), 'admin'),
  coalesce(nullif(e->>'action', ''), 'adjust'),
  coalesce(e->>'materialId', e->>'material_id'),
  coalesce(e->>'materialName', e->>'material_name'),
  nullif(e->>'qtyBefore', '')::numeric,
  nullif(e->>'qtyAfter', '')::numeric,
  e->>'note',
  coalesce(e->>'movementId', e->>'movement_id')
from public.menu_catalog m
cross join lateral jsonb_array_elements(coalesce(m.store->'stockAudit', '[]'::jsonb)) e
where m.id = 'finance'
  and coalesce(e->>'id', '') <> ''
on conflict (id) do nothing;

notify pgrst, 'reload schema';
