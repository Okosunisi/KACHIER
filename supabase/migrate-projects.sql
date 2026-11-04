-- KACHIER: PROJECTS UPDATE. Run this ONCE in Supabase (SQL Editor -> New query -> paste -> Run).
-- Safe to run again: it only ADDS things and never deletes or overwrites your sales or expenses.
-- (It assumes you already ran setup.sql before. If you did not, run setup.sql first.)

-- 1. Make sure older databases have the currency column used by sales.
alter table public.sales_transactions add column if not exists currency text not null default 'NGN';

-- 2. Projects table: each project belongs to one person.
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists projects_user on public.projects (user_id);
alter table public.projects enable row level security;
drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Link sales and expenses to a project.
--    RESTRICT means the database refuses to delete a project that still has records.
alter table public.sales_transactions add column if not exists project_id text references public.projects (id) on delete restrict;
alter table public.business_expenses  add column if not exists project_id text references public.projects (id) on delete restrict;
create index if not exists sales_project on public.sales_transactions (project_id);
create index if not exists expenses_project on public.business_expenses (project_id);

-- 4. Expense payment method becomes optional.
alter table public.business_expenses alter column pay drop not null;

-- 5. Existing records: give each person who already has records one project called "My Business"
--    and attach their old sales and expenses to it. Nothing is removed.
insert into public.projects (id, user_id, name, description)
select 'p-' || replace(u.user_id::text, '-', ''), u.user_id, 'My Business', 'Your records from before projects were added.'
from (
  select user_id from public.sales_transactions where project_id is null
  union
  select user_id from public.business_expenses where project_id is null
) u
on conflict (id) do nothing;

update public.sales_transactions s set project_id = 'p-' || replace(s.user_id::text, '-', '') where s.project_id is null;
update public.business_expenses e set project_id = 'p-' || replace(e.user_id::text, '-', '') where e.project_id is null;

-- 6. Security: a sale or expense can only point at a project that belongs to the same person.
drop policy if exists "own sales" on public.sales_transactions;
create policy "own sales" on public.sales_transactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())));

drop policy if exists "own expenses" on public.business_expenses;
create policy "own expenses" on public.business_expenses for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())));
