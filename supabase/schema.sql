-- Categories (seeded, not user-editable for now)
create table public.categories (
  id   serial primary key,
  name text not null unique,
  color text not null  -- hex color for UI badges
);

insert into public.categories (name, color) values
  ('Meat',              '#ef4444'),
  ('Dairy',             '#3b82f6'),
  ('Vegetables',        '#22c55e'),
  ('Fruit',             '#f97316'),
  ('Bread & Bakery',    '#d97706'),
  ('Drinks',            '#06b6d4'),
  ('Snacks',            '#a855f7'),
  ('Household',         '#64748b'),
  ('Hygiene',           '#ec4899'),
  ('Subscriptions',     '#8b5cf6'),
  ('Dining',            '#f59e0b'),
  ('Other',             '#94a3b8');

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

-- Categories are public read
create policy "Anyone reads categories"
  on public.categories for select
  using (true);

-- Grants
grant usage on schema public to anon, authenticated;
grant all on public.receipts to authenticated;
grant all on public.items to authenticated;
grant select on public.categories to anon, authenticated;

-- Budgets (monthly spend limits per category)
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
