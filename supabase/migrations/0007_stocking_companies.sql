-- Who makes the product. Categories mostly imply it today, but a category can
-- carry more than one brand as the route grows, so it is its own field.

create table if not exists public.stocking_companies (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.stocking_companies enable row level security;

drop policy if exists stocking_companies_rw on public.stocking_companies;
create policy stocking_companies_rw on public.stocking_companies
  for all to authenticated using (true) with check (true);

insert into public.stocking_companies (slug, name, sort_order) values
  ('pepperidge-farm',    'Pepperidge Farm',    1),
  ('archway',            'Archway',            2),
  ('cape-cod',           'Cape Cod',           3),
  ('snyders-of-hanover', 'Snyders of Hanover', 4),
  ('lance',              'Lance',              5)
on conflict (slug) do nothing;

-- Nulled rather than cascading if a company is ever removed: losing the label
-- should never take the item and its recorded counts with it.
alter table public.stocking_items
  add column if not exists company_id uuid references public.stocking_companies(id) on delete set null;

create index if not exists stocking_items_company_idx on public.stocking_items (company_id);

-- Backfill from the category each item already sits in.
update public.stocking_items i
set company_id = co.id
from public.stocking_categories c, public.stocking_companies co
where c.id = i.category_id
  and i.company_id is null
  and co.slug = case c.slug
    when 'goldfish' then 'pepperidge-farm'
    when 'milanos'  then 'pepperidge-farm'
    when 'archway'  then 'archway'
    when 'cape-cod' then 'cape-cod'
    when 'snyders'  then 'snyders-of-hanover'
    when 'lance'    then 'lance'
  end;

-- Multipacks was one bucket holding three pack sizes. Split it by the size
-- already stated at the front of each item name.
update public.stocking_items
set subgroup = case
  when name like '12ct%' then '12ct'
  when name like '20ct%' then '20ct'
  when name like '30ct%' then '30ct'
  else subgroup
end
where category_id = (select id from public.stocking_categories where slug = 'goldfish')
  and subgroup = 'Multipacks';
