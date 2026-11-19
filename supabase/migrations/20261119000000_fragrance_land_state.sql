create table if not exists public.fragrance_land_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fragrance_land_state enable row level security;
revoke all on table public.fragrance_land_state from anon, authenticated;
grant all on table public.fragrance_land_state to service_role;

insert into public.fragrance_land_state (id, data)
values ('production', jsonb_build_object(
  'categories', '[]'::jsonb,
  'products', '[]'::jsonb,
  'orders', '[]'::jsonb,
  'pendingCheckouts', '[]'::jsonb
))
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('fragrance-products', 'fragrance-products', true)
on conflict (id) do update set public = excluded.public;

