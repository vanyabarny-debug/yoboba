-- ослабить resolve: не требовать expires_at (код жив, пока used_at is null)
-- выполнить в supabase sql editor

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
   order by pc.created_at desc
   limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.resolve_pickup_code(text) from public;
grant execute on function public.resolve_pickup_code(text) to service_role;
