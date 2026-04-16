create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  name text not null,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

alter table households add column if not exists owner_id uuid references auth.users(id);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null,
  kind text not null check (kind in ('expense', 'income')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null,
  type text not null check (type in ('expense', 'income')),
  category_id uuid not null references categories(id) on delete restrict,
  paid_by text not null,
  transaction_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('owner', 'member')) default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table household_members add column if not exists display_name text;

create table if not exists household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_household on categories(household_id);
create index if not exists idx_transactions_household_date on transactions(household_id, transaction_date desc);
create index if not exists idx_household_members_user on household_members(user_id);
create index if not exists idx_household_invites_code on household_invites(code);

alter table households enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;

-- Drop ALL existing policies (regardless of name) to avoid leftover recursive ones
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('households','household_members','categories','transactions','household_invites')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "households select"
on households for select
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from household_members hm
    where hm.household_id = households.id
      and hm.user_id = auth.uid()
  )
);

create policy "households insert"
on households for insert
with check (owner_id = auth.uid());

create policy "households update"
on households for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "households delete"
on households for delete
using (owner_id = auth.uid());

create policy "categories select"
on categories for select
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = categories.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "categories insert"
on categories for insert
with check (
  exists (
    select 1
    from household_members hm
    where hm.household_id = categories.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "categories update"
on categories for update
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = categories.household_id
      and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from household_members hm
    where hm.household_id = categories.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "categories delete"
on categories for delete
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = categories.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "transactions select"
on transactions for select
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "transactions insert"
on transactions for insert
with check (
  exists (
    select 1
    from household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "transactions update"
on transactions for update
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "transactions delete"
on transactions for delete
using (
  exists (
    select 1
    from household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = auth.uid()
  )
);

create policy "household members select"
on household_members for select
using (user_id = auth.uid());

create policy "household members insert"
on household_members for insert
with check (user_id = auth.uid());

create policy "household members update"
on household_members for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "household members delete"
on household_members for delete
using (user_id = auth.uid() and role = 'member');

drop policy if exists "household invites select" on household_invites;
create policy "household invites select"
on household_invites for select
using (auth.role() = 'authenticated');

drop policy if exists "household invites insert" on household_invites;
create policy "household invites insert"
on household_invites for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from households h
    where h.id = household_invites.household_id
      and h.owner_id = auth.uid()
  )
);

drop policy if exists "household invites delete" on household_invites;
create policy "household invites delete"
on household_invites for delete
using (
  exists (
    select 1
    from households h
    where h.id = household_invites.household_id
      and h.owner_id = auth.uid()
  )
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_transactions_updated_at on transactions;
create trigger set_transactions_updated_at
before update on transactions
for each row execute function set_updated_at();

insert into households (id, owner_id, name)
values ('11111111-1111-1111-1111-111111111111', null, 'Casa Clara')
on conflict (id) do nothing;

insert into household_members (household_id, user_id, role)
select h.id, h.owner_id, 'owner'
from households h
where h.owner_id is not null
on conflict (household_id, user_id) do nothing;

update household_members
set display_name = coalesce(display_name, split_part(u.email, '@', 1))
from auth.users u
where u.id = household_members.user_id
  and household_members.display_name is null;

insert into categories (id, household_id, name, color, icon, kind, is_default) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Moradia', '#355c7d', 'Home', 'expense', true),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Supermercado', '#c06c84', 'ShoppingBasket', 'expense', true),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Transporte', '#6c5b7b', 'Car', 'expense', true),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'Lazer', '#f67280', 'Ticket', 'expense', true),
  ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111111', 'Saude', '#2a9d8f', 'HeartPulse', 'expense', true),
  ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111111', 'Receitas', '#2f855a', 'Wallet', 'income', true),
  ('22222222-2222-2222-2222-222222222207', '11111111-1111-1111-1111-111111111111', 'Contas da Casa', '#f4a261', 'ReceiptText', 'expense', true)
on conflict (id) do nothing;

