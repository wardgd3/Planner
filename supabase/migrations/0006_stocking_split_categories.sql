-- Snyders and Lance are separate vendors, and Archway is its own brand.
-- Splitting them out of the combined categories they were seeded into.
--
-- Item ids are untouched, so recorded counts in stocking_entries follow their
-- items into the new categories without any remapping.

insert into public.stocking_categories (slug, name, route, sort_order) values
  ('archway', 'Archway', 'shane', 3),
  ('lance',   'Lance',   'shane', 6)
on conflict (slug) do nothing;

update public.stocking_categories set name = 'Snyders', sort_order = 5 where slug = 'snyders';
update public.stocking_categories set sort_order = 4 where slug = 'cape-cod';

-- Lance moves out of the combined category. Its subgroups drop the redundant
-- "Lance " prefix now that the category carries the vendor name.
update public.stocking_items i
set category_id = (select id from public.stocking_categories where slug = 'lance'),
    subgroup = case i.subgroup
      when 'Lance Crackers' then 'Crackers'
      when 'Lance Nekot'    then 'Nekot'
      when 'Lance 20ct'     then '20ct'
      when 'Lance 10ct'     then '10ct'
      else i.subgroup
    end
where i.category_id = (select id from public.stocking_categories where slug = 'snyders')
  and i.subgroup like 'Lance%';

-- What remains in Snyders is all Snyders, so the subgroup adds nothing.
update public.stocking_items
set subgroup = null
where category_id = (select id from public.stocking_categories where slug = 'snyders')
  and subgroup = 'Snyders';

-- Archway becomes a category, so the brand comes off the item names. They were
-- prefixed only to avoid colliding with Milano Lemon and Raspberry in exports,
-- which print the category and no longer need the help.
update public.stocking_items
set category_id = (select id from public.stocking_categories where slug = 'archway'),
    subgroup = null,
    name = regexp_replace(name, '^Archway ', ''),
    slug = regexp_replace(slug, '^milanos-archway-', 'archway-')
where subgroup = 'Archway';

-- Close the gaps left in sort_order by the moves, preserving relative order.
with renumbered as (
  select id, row_number() over (partition by category_id order by sort_order, name) as rn
  from public.stocking_items
)
update public.stocking_items i
set sort_order = r.rn
from renumbered r
where r.id = i.id and i.sort_order <> r.rn;
