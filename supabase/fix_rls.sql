-- Fix RLS (the original schema ran ALTER TABLE before CREATE TABLE, so RLS was never enabled)
alter table public.receipts enable row level security;
alter table public.items enable row level security;
alter table public.categories enable row level security;

-- Ensure authenticated users can read/write their own data
grant usage on schema public to anon, authenticated;
grant all on public.receipts to authenticated;
grant all on public.items to authenticated;
grant select on public.categories to anon, authenticated;

-- Make receipt images publicly readable (private bucket blocks image display)
update storage.buckets set public = true where id = 'receipts';
