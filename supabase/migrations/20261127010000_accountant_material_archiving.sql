alter table public.accountant_materials
  add column if not exists archived boolean not null default false;

create index if not exists accountant_materials_active_idx
  on public.accountant_materials(archived, purchase_date desc);
