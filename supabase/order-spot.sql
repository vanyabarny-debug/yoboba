-- точка продажи на заказе (касса / самовывоз)
alter table public.orders
  add column if not exists spot_id text;

create index if not exists idx_orders_spot_id
  on public.orders (spot_id);

create index if not exists idx_orders_spot_created
  on public.orders (spot_id, created_at desc);
