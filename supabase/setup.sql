-- KACHIER: run this ONCE in Supabase (SQL Editor -> New query -> paste -> Run).
-- Each person can only see and change their own rows (Row Level Security).

create table if not exists public.sales_transactions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  product text not null,
  qty numeric not null check (qty > 0),
  price bigint not null check (price >= 0),
  total bigint not null check (total >= 0),
  pay text not null check (pay in ('Cash', 'Bank Transfer', 'POS', 'Other')),
  customer text not null default '',
  notes text not null default '',
  currency text not null default 'NGN',
  created_at timestamptz not null default now()
);

-- Optional migration for existing projects:
-- alter table public.sales_transactions add column if not exists currency text not null default 'NGN';

create table if not exists public.business_expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  name text not null,
  amount bigint not null check (amount > 0),
  category text not null,
  pay text not null check (pay in ('Cash', 'Bank Transfer', 'POS', 'Other')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sales_user_date on public.sales_transactions (user_id, date);
create index if not exists expenses_user_date on public.business_expenses (user_id, date);

alter table public.sales_transactions enable row level security;
alter table public.business_expenses enable row level security;

drop policy if exists "own sales" on public.sales_transactions;
create policy "own sales" on public.sales_transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own expenses" on public.business_expenses;
create policy "own expenses" on public.business_expenses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PROJECTS UPDATE: after running this file, also run supabase/migrate-projects.sql (once).
