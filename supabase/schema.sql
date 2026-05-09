-- Category groups (top-level, seeded)
create table public.category_groups (
  id    serial primary key,
  name  text not null unique,
  color text not null
);

insert into public.category_groups (name, color) values
  ('Groceries',               '#22c55e'),
  ('Drinks',                  '#06b6d4'),
  ('Dining & Takeout',        '#f59e0b'),
  ('Household',               '#64748b'),
  ('Hygiene & Beauty',        '#ec4899'),
  ('Health & Medical',        '#ef4444'),
  ('Clothing',                '#8b5cf6'),
  ('Transport',               '#3b82f6'),
  ('Digital & Subscriptions', '#6366f1'),
  ('Electronics',             '#0ea5e9'),
  ('Housing',                 '#84cc16'),
  ('Education',               '#f97316'),
  ('Entertainment',           '#a855f7'),
  ('Travel',                  '#14b8a6'),
  ('Finance & Fees',          '#94a3b8'),
  ('Pets',                    '#d97706'),
  ('Gifts & Donations',       '#f43f5e'),
  ('Other',                   '#71717a');

-- Categories (subcategories, seeded)
create table public.categories (
  id       serial primary key,
  group_id integer references public.category_groups(id) not null,
  name     text not null unique
);

-- Receipts
create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  store       text,
  date        date not null default current_date,
  total       numeric(10,2),
  image_url   text,
  created_at  timestamptz default now()
);

-- Items (line items from a receipt)
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid references public.receipts(id) on delete cascade not null,
  name        text not null,
  raw_name    text,         -- original Polish text from receipt
  price       numeric(10,2) not null,
  category_id integer references public.categories(id),
  created_at  timestamptz default now()
);

-- Enable RLS (must come after CREATE TABLE)
alter table public.receipts enable row level security;
alter table public.items enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;

-- RLS policies: users can only see their own data
create policy "Users see own receipts"
  on public.receipts for all
  using (auth.uid() = user_id);

create policy "Users see own items"
  on public.items for all
  using (
    receipt_id in (
      select id from public.receipts where user_id = auth.uid()
    )
  );

-- Category groups and categories are public read
create policy "Anyone reads category_groups"
  on public.category_groups for select
  using (true);

create policy "Anyone reads categories"
  on public.categories for select
  using (true);

-- Grants
grant usage on schema public to anon, authenticated;
grant all on public.receipts to authenticated;
grant all on public.items to authenticated;
grant select on public.category_groups to anon, authenticated;
grant select on public.categories to anon, authenticated;

-- Budgets (monthly spend limits per category group)
create table public.budgets (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users(id) on delete cascade not null,
  group_id integer references public.category_groups(id) not null,
  amount   numeric(10,2) not null default 0,
  unique(user_id, group_id)
);
alter table public.budgets enable row level security;
create policy "Users manage own budgets"
  on public.budgets for all
  using (auth.uid() = user_id);
grant all on public.budgets to authenticated;

-- User settings (language preference etc.)
create table public.user_settings (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en'
);
alter table public.user_settings enable row level security;
create policy "Users manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id);
grant all on public.user_settings to authenticated;

-- Storage bucket for receipt images (public so images display in the app)
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true);

create policy "Users manage own receipt images"
  on storage.objects for all
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
