-- History needs to tell the in-progress inventory from finished ones.
-- Null while open; set when the user hits Close.

alter table public.stocking_sessions
  add column if not exists closed_at timestamptz;

comment on column public.stocking_sessions.closed_at is
  'Null while the inventory is open/in progress; set when the user closes it.';

create index if not exists stocking_sessions_open_idx
  on public.stocking_sessions (user_id, closed_at)
  where closed_at is null;
