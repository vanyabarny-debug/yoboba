-- аватарка-эмоджи в профиле
alter table public.profiles
  add column if not exists avatar_emoji text;

-- автосоздание профиля: сразу рандомный эмоджи
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pool text[] := array[
    '🧋','🍵','🥤','🍓','🍑','🍒','🥝','🥭','🍋','🍊','🍉','🍇',
    '🐻','🐼','🦊','🐱','🐰','🐸','🐯','🦄','🍩','🍪','🧁','🍰',
    '🍦','🌙','⭐','💫','🔥','💚','💙','💜','✨','🌸','🍀','🎯'
  ];
begin
  insert into public.profiles (id, phone, name, avatar_emoji)
  values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'name', 'гость'),
    pool[1 + floor(random() * array_length(pool, 1))::int]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- существующим без эмоджи — выдать случайный (бесплатно, один раз)
update public.profiles
set avatar_emoji = (
  (array[
    '🧋','🍵','🥤','🍓','🍑','🍒','🥝','🥭','🍋','🍊','🍉','🍇',
    '🐻','🐼','🦊','🐱','🐰','🐸','🐯','🦄','🍩','🍪','🧁','🍰',
    '🍦','🌙','⭐','💫','🔥','💚','💙','💜','✨','🌸','🍀','🎯'
  ])[
    1 + (abs(hashtext(id::text)) % 36)
  ]
)
where avatar_emoji is null or avatar_emoji = '';
