create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

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

create index if not exists idx_categories_household on categories(household_id);
create index if not exists idx_transactions_household_date on transactions(household_id, transaction_date desc);

alter table households enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;

drop policy if exists "households public read" on households;
create policy "households public read"
on households for select
using (true);

drop policy if exists "categories public access" on categories;
create policy "categories public access"
on categories for all
using (true)
with check (true);

drop policy if exists "transactions public access" on transactions;
create policy "transactions public access"
on transactions for all
using (true)
with check (true);

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

insert into households (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Casa Clara')
on conflict (id) do nothing;

insert into categories (id, household_id, name, color, icon, kind, is_default) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Moradia', '#355c7d', 'Home', 'expense', true),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Supermercado', '#c06c84', 'ShoppingBasket', 'expense', true),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Transporte', '#6c5b7b', 'Car', 'expense', true),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'Lazer', '#f67280', 'Ticket', 'expense', true),
  ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111111', 'Saude', '#2a9d8f', 'HeartPulse', 'expense', true),
  ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111111', 'Receitas', '#2f855a', 'Wallet', 'income', true),
  ('22222222-2222-2222-2222-222222222207', '11111111-1111-1111-1111-111111111111', 'Contas da Casa', '#f4a261', 'ReceiptText', 'expense', true)
on conflict (id) do nothing;

