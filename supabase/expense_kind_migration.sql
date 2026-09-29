-- Expense kind per receipt:
--   normal    — day-to-day spending, counted against the monthly category budgets
--   unusual   — irregular purchases (clothes, a bike, appliances); tracked against a
--               yearly budget and a running average instead of monthly limits
--   mandatory — unavoidable costs (conference flights, taxes); no budget, own section
-- Idempotent: safe to run on an existing deployment.

alter table public.receipts
  add column if not exists kind text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'receipts_kind_check'
  ) then
    alter table public.receipts
      add constraint receipts_kind_check check (kind in ('normal', 'unusual', 'mandatory'));
  end if;
end $$;

create index if not exists receipts_user_kind_date_idx
  on public.receipts (user_id, kind, date);

-- Yearly budget for unusual/irregular purchases (0 = not set).
alter table public.user_settings
  add column if not exists unusual_yearly_budget numeric(12,2) not null default 0;
