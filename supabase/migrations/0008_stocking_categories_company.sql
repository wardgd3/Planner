-- Categories belong to a company, so picking a company can narrow the type
-- list when adding an item. Nulled rather than cascaded on delete: removing a
-- company should never take its categories and their items with it.

alter table public.stocking_categories
  add column if not exists company_id uuid references public.stocking_companies(id) on delete set null;

create index if not exists stocking_categories_company_idx
  on public.stocking_categories (company_id);

update public.stocking_categories c
set company_id = co.id
from public.stocking_companies co
where c.company_id is null
  and co.slug = case c.slug
    when 'goldfish' then 'pepperidge-farm'
    when 'milanos'  then 'pepperidge-farm'
    when 'archway'  then 'archway'
    when 'cape-cod' then 'cape-cod'
    when 'snyders'  then 'snyders-of-hanover'
    when 'lance'    then 'lance'
  end;

-- An item's company is now implied by its type. Realign any that drifted so
-- the two can never disagree.
update public.stocking_items i
set company_id = c.company_id
from public.stocking_categories c
where c.id = i.category_id
  and c.company_id is not null
  and i.company_id is distinct from c.company_id;
