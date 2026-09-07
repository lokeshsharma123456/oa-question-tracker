create table public.question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  solved boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_progress enable row level security;

grant select, insert, update, delete on public.question_progress to authenticated;

create policy "Users manage their own question progress"
on public.question_progress
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.set_question_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_question_progress_updated_at
before update on public.question_progress
for each row execute function public.set_question_progress_updated_at();
