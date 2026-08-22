-- An inventory is now a whole trip. Stores become legs inside it, so the user
-- starts one inventory and switches location from a dropdown.

create table if not exists public.stocking_inventories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inventory_date date not null default current_date,
  label          text,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists stocking_inventories_user_date_idx
  on public.stocking_inventories (user_id, inventory_date desc);

alter table public.stocking_sessions
  add column if not exists inventory_id uuid references public.stocking_inventories(id) on delete cascade;

-- Backfill: every existing store-session becomes a leg of an inventory for its
-- own date, so nothing already counted is lost.
insert into public.stocking_inventories (user_id, inventory_date, closed_at, created_at)
select s.user_id, s.session_date, max(s.closed_at), min(s.created_at)
from public.stocking_sessions s
where s.inventory_id is null
group by s.user_id, s.session_date;

update public.stocking_sessions s
set inventory_id = i.id
from public.stocking_inventories i
where s.inventory_id is null
  and i.user_id = s.user_id
  and i.inventory_date = s.session_date;

alter table public.stocking_sessions alter column inventory_id set not null;

-- One leg per store per inventory. Guaranteed unique already, because the old
-- constraint was (user_id, store_id, session_date) and each inventory maps to
-- exactly one (user_id, date).
alter table public.stocking_sessions
  add constraint stocking_sessions_inventory_store_key unique (inventory_id, store_id);

-- The inventory owns the date and the open/closed state now. Dropping these
-- also drops the constraints and indexes that depended on them.
alter table public.stocking_sessions drop column if exists session_date;
alter table public.stocking_sessions drop column if exists closed_at;

create index if not exists stocking_sessions_inventory_idx
  on public.stocking_sessions (inventory_id);

alter table public.stocking_inventories enable row level security;

drop policy if exists stocking_inventories_user_rows on public.stocking_inventories;
create policy stocking_inventories_user_rows on public.stocking_inventories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists stocking_inventories_touch on public.stocking_inventories;
create trigger stocking_inventories_touch before update on public.stocking_inventories
  for each row execute function public.stocking_set_updated_at();
