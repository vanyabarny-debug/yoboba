-- история склада: кто / что / когда менял остатки (приложение само чистит старше 3 месяцев)
-- выполнить в Supabase SQL Editor (один раз)

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
