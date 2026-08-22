-- Seed the route catalog: stores, the four Shane categories, and every item
-- that appears in the 8/16 W Stone Dr + Fort Henry counts.
-- Re-runnable: conflicts on slug are ignored.

insert into public.stocking_stores (slug, name, has_shane, has_chris, sort_order) values
  ('walmart-w-stone-dr', 'Walmart - W Stone Dr', true,  true,  1),
  ('walmart-fort-henry', 'Walmart - Fort Henry', true,  false, 2),
  ('food-city',          'Food City',            false, true,  3),
  ('priceless',          'Priceless',            false, true,  4),
  ('food-lion',          'Food Lion',            false, true,  5)
on conflict (slug) do nothing;

insert into public.stocking_categories (slug, name, route, sort_order) values
  ('goldfish', 'Goldfish',          'shane', 1),
  ('milanos',  'Milanos & Cookies', 'shane', 2),
  ('cape-cod', 'Cape Cod',          'shane', 3),
  ('snyders',  'Snyders & Lance',   'shane', 4)
on conflict (slug) do nothing;

insert into public.stocking_items (category_id, slug, name, subgroup, sort_order)
select c.id, v.slug, v.name, v.subgroup, v.sort_order
from (values
  -- Goldfish -------------------------------------------------------------
  ('goldfish', 'gf-original',        'Original',           'Bags',         1),
  ('goldfish', 'gf-reg-ched',        'Reg Cheddar',        'Bags',         2),
  ('goldfish', 'gf-pretzel',         'Pretzel',            'Bags',         3),
  ('goldfish', 'gf-whole-grain',     'Whole Grain',        'Bags',         4),
  ('goldfish', 'gf-parm',            'Parm',               'Bags',         5),
  ('goldfish', 'gf-ranch',           'Ranch',              'Bags',         6),
  ('goldfish', 'gf-vanilla-cupcake', 'Vanilla Cupcake',    'Bags',         7),
  ('goldfish', 'gf-xtra-pizza',      'Xtra Pizza',         'Bags',         8),
  ('goldfish', 'gf-baby',            'Baby',               'Bags',         9),
  ('goldfish', 'gf-bulb',            'Bulbasaur',          'Characters',  10),
  ('goldfish', 'gf-char',            'Charmander',         'Characters',  11),
  ('goldfish', 'gf-squirtle',        'Squirtle',           'Characters',  12),
  ('goldfish', 'gf-pikachu',         'Pikachu',            'Characters',  13),
  ('goldfish', 'gf-pokemon',         'Pokemon',            'Characters',  14),
  ('goldfish', 'gf-toy-story',       'Toy Story',          'Characters',  15),
  ('goldfish', 'gf-fs-ched',         'FS Cheddar',         'Family Size', 16),
  ('goldfish', 'gf-fs-xched',        'FS Xtra Cheddar',    'Family Size', 17),
  ('goldfish', 'gf-fs-colors',       'FS Colors',          'Family Size', 18),
  ('goldfish', 'gf-12ct-ched',       '12ct Cheddar',       'Multipacks',  19),
  ('goldfish', 'gf-12ct-xched',      '12ct Xtra Cheddar',  'Multipacks',  20),
  ('goldfish', 'gf-12ct-color',      '12ct Colors',        'Multipacks',  21),
  ('goldfish', 'gf-20ct-say-cheese', '20ct Say Cheese',    'Multipacks',  22),
  ('goldfish', 'gf-30ct-ched',       '30ct Cheddar',       'Multipacks',  23),
  ('goldfish', 'gf-bulk-ched',       'Bulk Cheddar',       'Bulk',        24),
  ('goldfish', 'gf-bulk-color',      'Bulk Colors',        'Bulk',        25),
  ('goldfish', 'gf-bulk-wg',         'Bulk Whole Grain',   'Bulk',        26),
  ('goldfish', 'gf-bulk-mickey',     'Bulk Mickey',        'Bulk',        27),
  -- Milanos & cookies ----------------------------------------------------
  ('milanos',  'ml-milk',            'Milk',               'Milano',       1),
  ('milanos',  'ml-dark',            'Dark',               'Milano',       2),
  ('milanos',  'ml-dbl-milk',        'Dbl Milk',           'Milano',       3),
  ('milanos',  'ml-dbl-dark',        'Dbl Dark',           'Milano',       4),
  ('milanos',  'ml-milk-choc',       'Milk Chocolate',     'Milano',       5),
  ('milanos',  'ml-white-choc',      'White Chocolate',    'Milano',       6),
  ('milanos',  'ml-straw',           'Strawberry',         'Milano',       7),
  ('milanos',  'ml-raspberry',       'Raspberry',          'Milano',       8),
  ('milanos',  'ml-mango',           'Mango',              'Milano',       9),
  ('milanos',  'ml-lemon',           'Lemon',              'Milano',      10),
  ('milanos',  'ml-pecan',           'Pecan',              'Milano',      11),
  ('milanos',  'ml-butter',          'Butter (Chessmen)',  'Cookies',     12),
  ('milanos',  'ml-nantucket',       'Nantucket',          'Cookies',     13),
  ('milanos',  'ml-montauk',         'Montauk',            'Cookies',     14),
  ('milanos',  'ml-santa-cruz',      'Santa Cruz',         'Cookies',     15),
  ('milanos',  'ml-sausalito',       'Sausalito',          'Cookies',     16),
  ('milanos',  'ml-tahoe',           'Tahoe',              'Cookies',     17),
  ('milanos',  'ml-toffee',          'Toffee',             'Cookies',     18),
  -- Cape Cod -------------------------------------------------------------
  ('cape-cod', 'cc-original',        'Original',           null,           1),
  ('cape-cod', 'cc-low-fat',         'Low Fat',            null,           2),
  ('cape-cod', 'cc-mesq-bbq',        'Mesquite BBQ',       null,           3),
  ('cape-cod', 'cc-jalapeno',        'Jalapeno',           null,           4),
  ('cape-cod', 'cc-ssv',             'Sea Salt & Vinegar', null,           5),
  ('cape-cod', 'cc-party-og',        'Party Original',     null,           6),
  ('cape-cod', 'cc-party-lf',        'Party Low Fat',      null,           7),
  -- Snyders & Lance ------------------------------------------------------
  ('snyders',  'sn-hmo',             'HMO',                'Snyders',      1),
  ('snyders',  'sn-harvest-wheat',   'Harvest Wheat',      'Snyders',      2),
  ('snyders',  'sn-rods',            'Rods',               'Snyders',      3),
  ('snyders',  'sn-mini',            'Mini',               'Snyders',      4),
  ('snyders',  'sn-blue',            'Blue',               'Lance Crackers',  5),
  ('snyders',  'sn-cc',              'CC',                 'Lance Crackers',  6),
  ('snyders',  'sn-cch',             'CCH',                'Lance Crackers',  7),
  ('snyders',  'sn-chee-ched',       'Chee Cheddar',       'Lance Crackers',  8),
  ('snyders',  'sn-white-ched',      'White Cheddar',      'Lance Crackers',  9),
  ('snyders',  'sn-wg-ched',         'WG Cheddar',         'Lance Crackers', 10),
  ('snyders',  'sn-grilled-cheese',  'Grilled Cheese',     'Lance Crackers', 11),
  ('snyders',  'sn-nashville',       'Nashville',          'Lance Crackers', 12),
  ('snyders',  'sn-toastee',         'Toastee',            'Lance Crackers', 13),
  ('snyders',  'sn-malt-pb',         'Malt PB',            'Lance Crackers', 14),
  ('snyders',  'sn-honey-pb',        'Honey PB',           'Lance Crackers', 15),
  ('snyders',  'sn-wgpb',            'WG PB',              'Lance Crackers', 16),
  ('snyders',  'sn-nekot-pb',        'Nekot PB',           'Lance Nekot',    17),
  ('snyders',  'sn-nekot-vanilla',   'Nekot Vanilla',      'Lance Nekot',    18),
  ('snyders',  'sn-nekot-fudge',     'Nekot Fudge',        'Lance Nekot',    19),
  ('snyders',  'sn-lemon',           'Lemon',              'Lance Nekot',    20),
  ('snyders',  'sn-20ct-toastee',    '20ct Toastee',       'Lance 20ct',     21),
  ('snyders',  'sn-20ct-blue',       '20ct Blue',          'Lance 20ct',     22),
  ('snyders',  'sn-20ct-cch',        '20ct CCH',           'Lance 20ct',     23),
  ('snyders',  'sn-20ct-chee-pb',    '20ct Chee PB',       'Lance 20ct',     24),
  ('snyders',  'sn-20ct-nekot',      '20ct Nekot',         'Lance 20ct',     25)
) as v(category_slug, slug, name, subgroup, sort_order)
join public.stocking_categories c on c.slug = v.category_slug
on conflict (slug) do nothing;
