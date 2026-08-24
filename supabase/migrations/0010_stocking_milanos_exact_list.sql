-- Milanos replaced with the route list, abbreviations expanded.
--
-- Done as renames keyed on slug rather than delete-and-reinsert: item ids stay
-- put, so the counts already recorded against them survive. stocking_entries
-- cascades from stocking_items, so recreating these rows would have wiped the
-- counts in the open inventories.

update public.stocking_items i set name = v.name, subgroup = v.subgroup, sort_order = v.ord
from (values
  -- Milano ----------------------------------------------------------------
  ('ml-milk-choc',                   'Milk Chocolate',             'Milano',   1),
  ('ml-dbl-milk',                    'Double Milk Chocolate',      'Milano',   2),
  ('ml-dbl-dark',                    'Double Dark Chocolate',      'Milano',   3),
  ('ml-dark',                        'Dark Chocolate',             'Milano',   4),
  ('milanos-mint',                   'Mint Chocolate',             'Milano',   5),
  ('ml-raspberry',                   'Raspberry Chocolate',        'Milano',   6),
  ('milanos-strawberry-white-choc',  'Strawberry White Chocolate', 'Milano',   7),
  ('ml-lemon',                       'Lemon White Chocolate',      'Milano',   8),
  ('milanos-coconut-white-choc',     'Coconut White Chocolate',    'Milano',   9),
  ('ml-mango',                       'Mango White Chocolate',      'Milano',  10),
  ('ml-straw',                       'Strawberry',                 'Milano',  11),
  ('milanos-apricot-raspberry',      'Apricot Raspberry',          'Milano',  12),
  ('ml-butter',                      'Butter',                     'Milano',  13),
  ('ml-pecan',                       'Pecan',                      'Milano',  14),
  -- Cookies ---------------------------------------------------------------
  ('ml-santa-cruz',                  'Santa Cruz',                 'Cookies', 15),
  ('milanos-ojai',                   'Ojai',                       'Cookies', 16),
  ('ml-montauk',                     'Montauk',                    'Cookies', 17),
  ('milanos-chesapeake',             'Chesapeake',                 'Cookies', 18),
  ('ml-nantucket',                   'Nantucket',                  'Cookies', 19),
  ('ml-sausalito',                   'Sausalito',                  'Cookies', 20),
  ('milanos-milk-chocolate-chip',    'Milk Chocolate Chip',        'Cookies', 21),
  ('ml-toffee',                      'Crispy Toffee',              'Cookies', 22)
) as v(slug, name, subgroup, ord)
where i.slug = v.slug;

-- Not on the list and never counted: nothing to lose, so they go.
delete from public.stocking_items
where slug in ('ml-tahoe', 'ml-white-choc');

-- Not on the list but carrying recorded counts. Retired rather than deleted:
-- hidden from checklists, still present in the inventories that used them.
--   ml-milk                            "Milk", 2 counts / 6 units
--   milanos-milk-chocolate-macadamia   "Milk Chocolate Macadamia", 1 count
update public.stocking_items
set is_active = false
where slug in ('ml-milk', 'milanos-milk-chocolate-macadamia');
