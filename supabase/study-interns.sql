-- заявки yoStudy → админка /admin/personnel → вкладка «стажёры»
-- выполнить в sql editor проекта supabase (одним куском)

create table if not exists public.study_interns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  city text not null default '',
  schedule text[] not null default '{}',
  intern_date date,
  intern_time text,
  urgent text not null default '',
  medbook text not null default '',
  guest text not null default '',
  shift text not null default '',
  cook text not null default '',
  status text not null default 'new'
    check (status in ('new', 'called', 'came', 'hired', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_study_interns_status on public.study_interns (status);
create index if not exists idx_study_interns_visit on public.study_interns (intern_date, intern_time);
create index if not exists idx_study_interns_created_at on public.study_interns (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_interns_updated_at on public.study_interns;
create trigger study_interns_updated_at
  before update on public.study_interns
  for each row execute function public.set_updated_at();

alter table public.study_interns enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_role'
  ) then
    execute 'drop policy if exists "study_interns_admin_all" on public.study_interns';
    execute 'create policy "study_interns_admin_all" on public.study_interns for all using (public.current_role() = ''admin'') with check (public.current_role() = ''admin'')';
  end if;
end $$;
