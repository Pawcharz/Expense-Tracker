-- Phase 1: Clean up old references
update public.items set category_id = null;
drop table if exists public.budgets;
drop policy if exists "Anyone reads categories" on public.categories;
alter table public.items drop constraint if exists items_category_id_fkey;
drop table if exists public.categories cascade;

-- Phase 2: Create new tables
create table public.category_groups (
  id    serial primary key,
  name  text not null unique,
  color text not null
);

create table public.categories (
  id       serial primary key,
  group_id integer references public.category_groups(id) not null,
  name     text not null unique
);

alter table public.items
  add constraint items_category_id_fkey
  foreign key (category_id) references public.categories(id);

alter table public.category_groups enable row level security;
alter table public.categories enable row level security;

create policy "Anyone reads category_groups" on public.category_groups for select using (true);
create policy "Anyone reads categories" on public.categories for select using (true);

grant select on public.category_groups to anon, authenticated;
grant select on public.categories to anon, authenticated;

-- Phase 3: Seed groups
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

-- Phase 4: Seed subcategories
insert into public.categories (group_id, name)
select id, unnest(array['Meat & Fish','Dairy & Eggs','Cheese','Bread & Bakery','Vegetables','Fruit','Frozen Food','Pantry & Dry Goods','Condiments & Spices','Snacks & Sweets','Baby Food'])
from public.category_groups where name = 'Groceries';

insert into public.categories (group_id, name)
select id, unnest(array['Water & Soft Drinks','Juice','Coffee & Tea','Alcohol','Energy Drinks'])
from public.category_groups where name = 'Drinks';

insert into public.categories (group_id, name)
select id, unnest(array['Restaurant','Fast Food','Café','Delivery','Bar'])
from public.category_groups where name = 'Dining & Takeout';

insert into public.categories (group_id, name)
select id, unnest(array['Cleaning Products','Kitchen Supplies','Furniture','Home Decor','Garden & Plants','Tools & Hardware','Storage'])
from public.category_groups where name = 'Household';

insert into public.categories (group_id, name)
select id, unnest(array['Personal Care','Cosmetics & Skincare','Haircare','Pharmacy & Supplements'])
from public.category_groups where name = 'Hygiene & Beauty';

insert into public.categories (group_id, name)
select id, unnest(array['Doctor / Clinic','Dentist','Pharmacy','Lab & Tests','Gym & Fitness','Sport Equipment'])
from public.category_groups where name = 'Health & Medical';

insert into public.categories (group_id, name)
select id, unnest(array['Everyday Clothing','Shoes','Outerwear','Accessories','Formal Wear','Sportswear','Underwear & Socks'])
from public.category_groups where name = 'Clothing';

insert into public.categories (group_id, name)
select id, unnest(array['Fuel','Public Transport','Taxi / Rideshare','Car Maintenance','Parking','Tolls','Flights'])
from public.category_groups where name = 'Transport';

insert into public.categories (group_id, name)
select id, unnest(array['Productivity Tools','Entertainment Streaming','Games','Cloud Storage','Software Licenses','Domain & Hosting'])
from public.category_groups where name = 'Digital & Subscriptions';

insert into public.categories (group_id, name)
select id, unnest(array['Phones & Tablets','Computers & Accessories','TV & Audio','Smart Home','Cables & Peripherals'])
from public.category_groups where name = 'Electronics';

insert into public.categories (group_id, name)
select id, unnest(array['Rent','Building Charges','Utilities','Internet & Phone Plan','Insurance'])
from public.category_groups where name = 'Housing';

insert into public.categories (group_id, name)
select id, unnest(array['Books & Textbooks','Courses & Workshops','School Supplies','Tuition'])
from public.category_groups where name = 'Education';

insert into public.categories (group_id, name)
select id, unnest(array['Cinema & Theatre','Events & Concerts','Books & Magazines','Hobbies','Toys & Games'])
from public.category_groups where name = 'Entertainment';

insert into public.categories (group_id, name)
select id, unnest(array['Accommodation','Activities & Tours','Travel Insurance','Luggage'])
from public.category_groups where name = 'Travel';

insert into public.categories (group_id, name)
select id, unnest(array['Bank Fees','Transaction Fees','Taxes','Fines','Loan Payments'])
from public.category_groups where name = 'Finance & Fees';

insert into public.categories (group_id, name)
select id, unnest(array['Pet Food','Vet','Pet Grooming','Pet Supplies'])
from public.category_groups where name = 'Pets';

insert into public.categories (group_id, name)
select id, unnest(array['Gifts','Charity','Flowers'])
from public.category_groups where name = 'Gifts & Donations';

insert into public.categories (group_id, name)
select id, unnest(array['Uncategorized'])
from public.category_groups where name = 'Other';

-- Phase 5: Budgets (now per group)
create table public.budgets (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users(id) on delete cascade not null,
  group_id integer references public.category_groups(id) not null,
  amount   numeric(10,2) not null default 0,
  unique(user_id, group_id)
);
alter table public.budgets enable row level security;
create policy "Users manage own budgets" on public.budgets for all using (auth.uid() = user_id);
grant all on public.budgets to authenticated;
