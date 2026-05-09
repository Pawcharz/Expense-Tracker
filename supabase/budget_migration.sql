create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  category_id integer references public.categories(id) not null,
  amount      numeric(10,2) not null default 0,
  unique(user_id, category_id)
);
alter table public.budgets enable row level security;
create policy "Users manage own budgets"
  on public.budgets for all
  using (auth.uid() = user_id);
grant all on public.budgets to authenticated;
