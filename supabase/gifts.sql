-- подарки между гостями (онлайн-оплата, выдача по телефону)
-- опционально: приложение сейчас хранит подарки в data-store.
-- этот sql — если захотите перенести в supabase.

create table if not exists public.gifts (
  id text primary key,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  sender_name text not null,
  sender_phone text,
  recipient_phone text not null,
  recipient_user_id uuid references public.profiles (id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total_price numeric(10, 2) not null check (total_price >= 0),
  message text,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'claimed', 'redeemed', 'cancelled')),
  payment_id text,
  payment_provider text not null default 'stub'
    check (payment_provider in ('stub', 'kassa')),
  checkout_url text,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_gifts_sender on public.gifts (sender_id, created_at desc);
create index if not exists idx_gifts_recipient_phone on public.gifts (recipient_phone, status);
