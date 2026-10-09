-- срок действия студенческого билета / скидки −30%
-- yoboba: выполнить в SQL Editor

alter table public.profiles
  add column if not exists student_expires_at date;

comment on column public.profiles.student_expires_at is
  'скидка −30% действует по эту дату включительно; после — снимается';
