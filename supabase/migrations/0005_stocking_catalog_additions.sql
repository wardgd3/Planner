-- Items from the full route list that were not already in the catalog.
-- Placed in the existing subgroup scheme; re-runnable via slug conflict.
--
-- Matched to existing rows rather than added (route shorthand -> catalog name):
--   Ched -> Reg Cheddar, WG -> Whole Grain, Pizza -> Xtra Pizza
--   Charmandar -> Charmander, crispy toffee -> Toffee
--   Lemon white choc -> Lemon, Mango white choc -> Mango
--   Toasty PB -> Toastee, CC chives -> CCH, Nashville hot -> Nashville
--   Pieces honey mustard onion -> HMO, OG sea salt -> Original, SSV -> Sea Salt & Vinegar
--
-- Archway entries carry the brand in the name because Milano already has a
-- Lemon and a Raspberry, and exports no longer print the subgroup column.

insert into public.stocking_items (category_id, slug, name, subgroup, sort_order, is_active)
select
  c.id,
  v.slug,
  v.name,
  v.subgroup,
  (select coalesce(max(i2.sort_order), 0) from public.stocking_items i2 where i2.category_id = c.id) + v.ord,
  true
from (values
  -- Goldfish ---------------------------------------------------------------
  ('goldfish', 'goldfish-colors',                'Colors',                'Bags',           1),
  ('goldfish', 'goldfish-xtra-cheddar',          'Xtra Cheddar',          'Bags',           2),
  ('goldfish', 'goldfish-pretzel-honey-mustard', 'Pretzel Honey Mustard', 'Bags',           3),
  ('goldfish', 'goldfish-pretzel-buffalo',       'Pretzel Buffalo',       'Bags',           4),
  ('goldfish', 'goldfish-20ct-family-faves',     '20ct Family Faves',     'Multipacks',     5),
  ('goldfish', 'goldfish-20ct-cheddar',          '20ct Cheddar',          'Multipacks',     6),
  ('goldfish', 'goldfish-20ct-dynamic-duo',      '20ct Dynamic Duo',      'Multipacks',     7),
  ('goldfish', 'goldfish-30ct-big-smiles',       '30ct Big Smiles',       'Multipacks',     8),
  ('goldfish', 'goldfish-30ct-bold-mix',         '30ct Bold Mix',         'Multipacks',     9),
  -- Milanos & cookies ------------------------------------------------------
  ('milanos',  'milanos-mint',                   'Mint',                  'Milano',         1),
  ('milanos',  'milanos-strawberry-white-choc',  'Strawberry White Choc', 'Milano',         2),
  ('milanos',  'milanos-coconut-white-choc',     'Coconut White Choc',    'Milano',         3),
  ('milanos',  'milanos-apricot-raspberry',      'Apricot Raspberry',     'Milano',         4),
  ('milanos',  'milanos-ojai',                   'Ojai',                  'Cookies',        5),
  ('milanos',  'milanos-chesapeake',             'Chesapeake',            'Cookies',        6),
  ('milanos',  'milanos-milk-chocolate-chip',    'Milk Chocolate Chip',   'Cookies',        7),
  ('milanos',  'milanos-archway-raspberry',      'Archway Raspberry',     'Archway',        8),
  ('milanos',  'milanos-archway-lemon',          'Archway Lemon',         'Archway',        9),
  ('milanos',  'milanos-archway-oatmeal',        'Archway Oatmeal',       'Archway',       10),
  -- Cape Cod ---------------------------------------------------------------
  ('cape-cod', 'cape-cod-20ct-multipack',        '20ct Multipack',        null,             1),
  -- Lance ------------------------------------------------------------------
  ('snyders',  'snyders-toastchee-pb',           'Toastchee PB',          'Lance Crackers', 1),
  ('snyders',  'snyders-gluten-free',            'Gluten Free',           'Lance Crackers', 2),
  ('snyders',  'snyders-20ct-variety',           '20ct Variety',          'Lance 20ct',     3),
  ('snyders',  'snyders-10ct-captains-variety',  '10ct Captains Variety', 'Lance 10ct',     4),
  ('snyders',  'snyders-10ct-variety-blue',      '10ct Variety Blue',     'Lance 10ct',     5),
  -- Snyders ----------------------------------------------------------------
  ('snyders',  'snyders-twisted',                'Twisted',               'Snyders',        6),
  ('snyders',  'snyders-honey-oat',              'Honey Oat',             'Snyders',        7),
  ('snyders',  'snyders-honey-wheat',            'Honey Wheat',           'Snyders',        8),
  ('snyders',  'snyders-sticks',                 'Sticks',                'Snyders',        9),
  ('snyders',  'snyders-snaps',                  'Snaps',                 'Snyders',       10),
  ('snyders',  'snyders-buttersnaps',            'Buttersnaps',           'Snyders',       11),
  ('snyders',  'snyders-cheddar-sandwiches',     'Cheddar Sandwiches',    'Snyders',       12),
  ('snyders',  'snyders-pieces-cheddar',         'Pieces Cheddar',        'Snyders',       13),
  ('snyders',  'snyders-pieces-buffalo',         'Pieces Buffalo',        'Snyders',       14),
  ('snyders',  'snyders-sourdough',              'Sourdough',             'Snyders',       15)
) as v(category_slug, slug, name, subgroup, ord)
join public.stocking_categories c on c.slug = v.category_slug
on conflict (slug) do nothing;
