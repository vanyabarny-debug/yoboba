-- оплата и контакты гостя на заказе (для кассы бариста)

alter table public.orders
  add column if not exists is_paid boolean not null default false,
  add column if not exists customer_name text,
  add column if not exists customer_phone text;
