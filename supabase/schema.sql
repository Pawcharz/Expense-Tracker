-- Enable RLS
alter table if exists public.receipts enable row level security;
alter table if exists public.items enable row level security;

-- Categories (seeded, not user-editable for now)
create table public.categories (
  id   serial primary key,
  name text not null unique,
  color text not null
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

create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  store       text,
  date        date not null default current_date,
  total       numeric(10,2),
  image_url   text,
  created_at  timestamptz default now()
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid references public.receipts(id) on delete cascade not null,
  name        text not null,
  raw_name    text,
  price       numeric(10,2) not null,
  category_id integer references public.categories(id),
  created_at  timestamptz default now()
);

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

create policy "Anyone reads categories"
  on public.categories for select
  using (true);

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "Users manage own receipt images"
  on storage.objects for all
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
