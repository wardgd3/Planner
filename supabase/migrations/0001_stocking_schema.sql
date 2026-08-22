-- Stocking route app.
-- Everything is prefixed `stocking_` so it lives alongside the existing
-- habit/planner tables in this project without touching them.

create extension if not exists pgcrypto;

create or replace function public.stocking_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ---------------------------------------------------------------- catalog

create table if not exists public.stocking_stores (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  has_shane  boolean not null default false,
  has_chris  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.stocking_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  route      text not null default 'shane' check (route in ('shane', 'chris')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.stocking_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.stocking_categories(id) on delete cascade,
  slug        text not null unique,
  name        text not null,
  subgroup    text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists stocking_items_category_idx
  on public.stocking_items (category_id, sort_order);

-- ------------------------------------------------------- per-visit counts

create table if not exists public.stocking_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_id     uuid not null references public.stocking_stores(id) on delete cascade,
  session_date date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, store_id, session_date)
);

create index if not exists stocking_sessions_user_date_idx
  on public.stocking_sessions (user_id, session_date desc);

create table if not exists public.stocking_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.stocking_sessions(id) on delete cascade,
  item_id    uuid not null references public.stocking_items(id) on delete cascade,
  quantity   integer not null default 0 check (quantity >= 0 and quantity <= 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, item_id)
);

create index if not exists stocking_entries_session_idx
  on public.stocking_entries (session_id);

drop trigger if exists stocking_sessions_touch on public.stocking_sessions;
create trigger stocking_sessions_touch before update on public.stocking_sessions
  for each row execute function public.stocking_set_updated_at();

drop trigger if exists stocking_entries_touch on public.stocking_entries;
create trigger stocking_entries_touch before update on public.stocking_entries
  for each row execute function public.stocking_set_updated_at();

-- -------------------------------------------------------------------- RLS

alter table public.stocking_stores     enable row level security;
alter table public.stocking_categories enable row level security;
alter table public.stocking_items      enable row level security;
alter table public.stocking_sessions   enable row level security;
alter table public.stocking_entries    enable row level security;

-- Catalog is shared reference data for this single-operator app: any signed-in
-- user may read it and edit it (so the checklist can be maintained in-app).
drop policy if exists stocking_stores_rw on public.stocking_stores;
create policy stocking_stores_rw on public.stocking_stores
  for all to authenticated using (true) with check (true);

drop policy if exists stocking_categories_rw on public.stocking_categories;
create policy stocking_categories_rw on public.stocking_categories
  for all to authenticated using (true) with check (true);

drop policy if exists stocking_items_rw on public.stocking_items;
create policy stocking_items_rw on public.stocking_items
  for all to authenticated using (true) with check (true);

-- Counts are private to whoever recorded them.
drop policy if exists stocking_sessions_user_rows on public.stocking_sessions;
create policy stocking_sessions_user_rows on public.stocking_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists stocking_entries_user_rows on public.stocking_entries;
create policy stocking_entries_user_rows on public.stocking_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
