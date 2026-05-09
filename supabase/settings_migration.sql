create table public.user_settings (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en'
);
alter table public.user_settings enable row level security;
create policy "Users manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id);
grant all on public.user_settings to authenticated;
