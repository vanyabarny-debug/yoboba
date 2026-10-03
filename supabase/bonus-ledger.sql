-- бобаллы: журнал операций + атомарное изменение баланса
-- выполнить в sql editor проекта supabase (один раз)

-- журнал: каждое начисление / списание / возврат / слияние
create table if not exists public.bonus_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  order_id uuid,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bonus_transactions_user_created
  on public.bonus_transactions (user_id, created_at desc);
create index if not exists idx_bonus_transactions_order
  on public.bonus_transactions (order_id)
  where order_id is not null;

alter table public.bonus_transactions enable row level security;

drop policy if exists "bonus_transactions_select_own" on public.bonus_transactions;
create policy "bonus_transactions_select_own"
  on public.bonus_transactions for select
  using (auth.uid() = user_id or public.current_role() in ('admin', 'barista'));

-- атомарно меняем баланс и пишем строку в журнал.
-- отрицательная delta при нехватке баланса -> исключение 'insufficient_bonus'
create or replace function public.adjust_bonus_balance(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_order_id uuid default null,
  p_actor text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after integer;
begin
  if p_delta = 0 then
    select bonus_balance into v_after from public.profiles where id = p_user_id;
    if v_after is null then
      raise exception 'profile_not_found' using errcode = 'P0002';
    end if;
    return v_after;
  end if;

  update public.profiles
     set bonus_balance = bonus_balance + p_delta,
         updated_at = now()
   where id = p_user_id
     and bonus_balance + p_delta >= 0
  returning bonus_balance into v_after;

  if v_after is null then
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'profile_not_found' using errcode = 'P0002';
    end if;
    raise exception 'insufficient_bonus' using errcode = 'P0001';
  end if;

  insert into public.bonus_transactions (user_id, delta, balance_after, reason, order_id, actor)
  values (p_user_id, p_delta, v_after, p_reason, p_order_id, p_actor);

  return v_after;
end;
$$;

revoke all on function public.adjust_bonus_balance(uuid, integer, text, uuid, text) from public;
grant execute on function public.adjust_bonus_balance(uuid, integer, text, uuid, text) to service_role;
