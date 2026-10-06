-- pickup-коды лояльности: короткий одноразовый код для кассы (QR / цифры)
-- выполнить в sql editor проекта supabase (один раз)

create table if not exists public.pickup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pickup_codes_code_digits check (code ~ '^[0-9]{6}$')
);

-- один активный код на пользователя
create unique index if not exists idx_pickup_codes_one_active_per_user
  on public.pickup_codes (user_id)
  where used_at is null;

-- уникальность среди ещё живых кодов
create unique index if not exists idx_pickup_codes_active_code
  on public.pickup_codes (code)
  where used_at is null;

create index if not exists idx_pickup_codes_lookup
  on public.pickup_codes (code, expires_at)
  where used_at is null;

alter table public.pickup_codes enable row level security;

drop policy if exists "pickup_codes_select_own" on public.pickup_codes;
create policy "pickup_codes_select_own"
  on public.pickup_codes for select
  using (auth.uid() = user_id or public.current_role() in ('admin', 'barista'));

-- mint / ensure: вернуть активный код или создать новый
create or replace function public.ensure_pickup_code(
  p_user_id uuid,
  p_ttl_minutes integer default 10
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_expires timestamptz;
  v_attempt integer;
begin
  if p_ttl_minutes < 1 then
    p_ttl_minutes := 10;
  end if;

  select pc.code, pc.expires_at
    into v_code, v_expires
    from public.pickup_codes pc
   where pc.user_id = p_user_id
     and pc.used_at is null
     and pc.expires_at > now()
   order by pc.created_at desc
   limit 1;

  if v_code is not null then
    return query select v_code, v_expires;
    return;
  end if;

  -- просроченные/неактивные «активные» строки снимаем, чтобы unique index не мешал
  update public.pickup_codes
     set used_at = coalesce(used_at, now())
   where user_id = p_user_id
     and used_at is null;

  for v_attempt in 1..12 loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    v_expires := now() + make_interval(mins => p_ttl_minutes);
    begin
      insert into public.pickup_codes (user_id, code, expires_at)
      values (p_user_id, v_code, v_expires);
      return query select v_code, v_expires;
      return;
    exception
      when unique_violation then
        -- коллизия кода или гонка по user — пробуем снова
        null;
    end;
  end loop;

  raise exception 'pickup_code_mint_failed' using errcode = 'P0001';
end;
$$;

revoke all on function public.ensure_pickup_code(uuid, integer) from public;
grant execute on function public.ensure_pickup_code(uuid, integer) to service_role;

-- resolve: найти user_id по живому коду
create or replace function public.resolve_pickup_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if length(v_digits) <> 6 then
    return null;
  end if;

  select pc.user_id
    into v_user_id
    from public.pickup_codes pc
   where pc.code = v_digits
     and pc.used_at is null
     and pc.expires_at > now()
   limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.resolve_pickup_code(text) from public;
grant execute on function public.resolve_pickup_code(text) to service_role;

-- invalidate: пометить код использованным (по коду или все активные у user)
create or replace function public.invalidate_pickup_code(
  p_user_id uuid default null,
  p_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_updated integer := 0;
begin
  v_digits := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');

  if length(v_digits) = 6 then
    update public.pickup_codes
       set used_at = now()
     where code = v_digits
       and used_at is null
       and (p_user_id is null or user_id = p_user_id);
    get diagnostics v_updated = row_count;
  elsif p_user_id is not null then
    update public.pickup_codes
       set used_at = now()
     where user_id = p_user_id
       and used_at is null;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated > 0;
end;
$$;

revoke all on function public.invalidate_pickup_code(uuid, text) from public;
grant execute on function public.invalidate_pickup_code(uuid, text) to service_role;
