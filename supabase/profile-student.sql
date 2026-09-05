-- студенческая скидка: гость отмечает в профиле, касса/админ подтверждает

alter table public.profiles
  add column if not exists student_claimed boolean not null default false,
  add column if not exists student_verified boolean not null default false,
  add column if not exists student_verified_at timestamptz,
  add column if not exists student_verified_by text;
