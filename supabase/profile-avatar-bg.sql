-- цвет фона аватарки (null / пусто = accent темы)
alter table public.profiles
  add column if not exists avatar_bg text;
