-- Pepperidge Farm becomes Goldfish and Milanos. The route is stocked as two
-- separate lines, so treating them as one company forced an extra pick in the
-- Type dropdown that never carried any information.

insert into public.stocking_companies (slug, name, sort_order) values
  ('goldfish', 'Goldfish', 1),
  ('milanos',  'Milanos',  2)
on conflict (slug) do nothing;

update public.stocking_companies set sort_order = 3 where slug = 'archway';
update public.stocking_companies set sort_order = 4 where slug = 'cape-cod';
update public.stocking_companies set sort_order = 5 where slug = 'snyders-of-hanover';
update public.stocking_companies set sort_order = 6 where slug = 'lance';

update public.stocking_categories
set company_id = (select id from public.stocking_companies where slug = 'goldfish')
where slug = 'goldfish';

update public.stocking_categories
set company_id = (select id from public.stocking_companies where slug = 'milanos')
where slug = 'milanos';

-- Items take their company from their type, as the form now does on save.
update public.stocking_items i
set company_id = c.company_id
from public.stocking_categories c
where c.id = i.category_id
  and i.company_id is distinct from c.company_id;

-- Safe to drop only once nothing points at it; the FKs would otherwise null
-- out the category and item links rather than block the delete.
delete from public.stocking_companies co
where co.slug = 'pepperidge-farm'
  and not exists (select 1 from public.stocking_categories c where c.company_id = co.id)
  and not exists (select 1 from public.stocking_items i where i.company_id = co.id);
