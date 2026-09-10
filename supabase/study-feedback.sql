-- отзыв после второго теста yoStudy
-- выполнить в sql editor после study-interns.sql

alter table public.study_interns
  add column if not exists feedback_mood integer
    check (feedback_mood is null or (feedback_mood >= 1 and feedback_mood <= 5)),
  add column if not exists feedback_liked text not null default '',
  add column if not exists feedback_disliked text not null default '',
  add column if not exists feedback_at timestamptz;
