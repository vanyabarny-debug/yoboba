-- yoboba: полная схема для supabase sql editor
-- выполнить целиком в sql editor проекта supabase

-- расширения
create extension if not exists "pgcrypto";

-- типы
create type public.user_role as enum ('user', 'barista', 'admin');
create type public.order_status as enum ('new', 'preparing', 'ready', 'completed', 'cancelled');
create type public.payment_type as enum ('cash', 'card', 'online');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique,
  name text,
  bonus_balance integer not null default 0 check (bonus_balance >= 0),
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- menu
create table public.menu (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  category text not null,
  is_available boolean not null default true,
  recommendations uuid[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- cart_items (live-трекинг корзин)
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  menu_id uuid not null references public.menu (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, menu_id)
);

-- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  items jsonb not null default '[]'::jsonb,
  total_price numeric(10, 2) not null check (total_price >= 0),
  status public.order_status not null default 'new',
  payment_type public.payment_type not null default 'online',
  pickup_time timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- stories
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text not null,
  menu_id uuid references public.menu (id) on delete set null,
  active_until timestamptz not null,
  created_at timestamptz not null default now()
);

-- push_subscriptions (для рассылки пушей)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- индексы
create index idx_profiles_role on public.profiles (role);
create index idx_menu_category on public.menu (category);
create index idx_menu_is_available on public.menu (is_available);
create index idx_cart_items_user_id on public.cart_items (user_id);
create index idx_cart_items_updated_at on public.cart_items (updated_at desc);
create index idx_orders_user_id on public.orders (user_id);
create index idx_orders_status on public.orders (status);
create index idx_orders_created_at on public.orders (created_at desc);
create index idx_orders_pickup_time on public.orders (pickup_time);
create index idx_stories_active_until on public.stories (active_until desc);

-- updated_at триггер
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger menu_updated_at
  before update on public.menu
  for each row execute function public.set_updated_at();

create trigger cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, name)
  values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'name', 'гость')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- rls
alter table public.profiles enable row level security;
alter table public.menu enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.stories enable row level security;
alter table public.push_subscriptions enable row level security;

-- хелпер: роль текущего пользователя
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles policies
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.current_role() in ('admin', 'barista'));

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_all"
  on public.profiles for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- menu policies
create policy "menu_select_all"
  on public.menu for select
  using (true);

create policy "menu_admin_write"
  on public.menu for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- cart_items policies
create policy "cart_items_own"
  on public.cart_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cart_items_admin_read"
  on public.cart_items for select
  using (public.current_role() = 'admin');

-- orders policies
create policy "orders_select_own"
  on public.orders for select
  using (
    auth.uid() = user_id
    or public.current_role() in ('admin', 'barista')
  );

create policy "orders_insert_own"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "orders_update_staff"
  on public.orders for update
  using (public.current_role() in ('admin', 'barista'))
  with check (public.current_role() in ('admin', 'barista'));

-- stories policies
create policy "stories_select_active"
  on public.stories for select
  using (active_until > now() or public.current_role() = 'admin');

create policy "stories_admin_write"
  on public.stories for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- push_subscriptions policies
create policy "push_subscriptions_own"
  on public.push_subscriptions for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

create policy "push_subscriptions_admin_read"
  on public.push_subscriptions for select
  using (public.current_role() = 'admin');

-- realtime
alter publication supabase_realtime add table public.cart_items;
alter publication supabase_realtime add table public.orders;

-- меню: выполни supabase/seed-menu.sql после этой схемы
