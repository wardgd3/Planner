-- Route shorthand: HMO, CCH, WGPB, nekot and friends. Separate from
-- public.glossary_items, which is planner-domain (durations, times, habits).

create table if not exists public.stocking_glossary (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  term       text not null,
  definition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, term)
);

create index if not exists stocking_glossary_user_term_idx
  on public.stocking_glossary (user_id, term);

alter table public.stocking_glossary enable row level security;

drop policy if exists stocking_glossary_user_rows on public.stocking_glossary;
create policy stocking_glossary_user_rows on public.stocking_glossary
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists stocking_glossary_touch on public.stocking_glossary;
create trigger stocking_glossary_touch before update on public.stocking_glossary
  for each row execute function public.stocking_set_updated_at();
