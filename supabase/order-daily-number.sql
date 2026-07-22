-- дневная нумерация заказов: 1, 2, 3… каждый день заново (по дате order_day)

alter table public.orders
  add column if not exists order_number integer,
  add column if not exists order_day date;

create index if not exists idx_orders_order_day_number
  on public.orders (order_day, order_number);

create table if not exists public.order_day_counters (
  day date primary key,
  last_number integer not null default 0
);

create or replace function public.next_order_number(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.order_day_counters (day, last_number)
  values (p_day, 1)
  on conflict (day) do update
    set last_number = order_day_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

grant execute on function public.next_order_number(date) to service_role;
