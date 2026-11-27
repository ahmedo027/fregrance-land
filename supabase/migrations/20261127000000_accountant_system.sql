create extension if not exists pgcrypto;

create table if not exists public.accountant_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Raw Materials', 'Packaging', 'Shipping', 'Marketing', 'Advertising', 'Rent', 'Salaries', 'Subscriptions', 'Other Expenses')),
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountant_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  quantity numeric(16,3) not null default 0 check (quantity >= 0),
  unit text not null check (unit in ('ml', 'liters', 'grams', 'kilograms', 'pieces')),
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  cost_per_unit numeric(14,4) not null default 0 check (cost_per_unit >= 0),
  supplier text not null default '',
  purchase_date date not null,
  low_stock_threshold numeric(16,3) not null default 0 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountant_outside_sales (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  size_value integer not null check (size_value > 0),
  size_unit text not null check (size_unit in ('ml', 'g')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  payment_method text not null default 'Other',
  sale_date date not null,
  notes text not null default '',
  status text not null default 'Confirmed' check (status in ('Draft', 'Confirmed', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountant_production_batches (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  size_value integer not null check (size_value > 0),
  size_unit text not null check (size_unit in ('ml', 'g')),
  quantity_produced integer not null check (quantity_produced > 0),
  raw_material_cost numeric(14,2) not null default 0 check (raw_material_cost >= 0),
  packaging_cost numeric(14,2) not null default 0 check (packaging_cost >= 0),
  production_cost numeric(14,2) not null default 0 check (production_cost >= 0),
  cost_per_finished_product numeric(14,4) not null default 0 check (cost_per_finished_product >= 0),
  batch_date date not null,
  notes text not null default '',
  status text not null default 'Confirmed' check (status in ('Draft', 'Confirmed', 'Cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.accountant_production_batch_materials (
  batch_id uuid not null references public.accountant_production_batches(id) on delete cascade,
  material_id uuid not null references public.accountant_materials(id) on delete restrict,
  quantity_used numeric(16,3) not null check (quantity_used > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0),
  primary key (batch_id, material_id)
);

create table if not exists public.accountant_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  movement_type text not null,
  reference_id text not null,
  inventory_key text not null,
  product_id text,
  material_id uuid references public.accountant_materials(id) on delete restrict,
  size_value integer,
  size_unit text,
  quantity_delta numeric(16,3) not null,
  unit text not null,
  unit_cost numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.accountant_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'admin',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists accountant_expenses_date_idx on public.accountant_expenses(transaction_date desc);
create index if not exists accountant_materials_category_idx on public.accountant_materials(category);
create index if not exists accountant_sales_date_idx on public.accountant_outside_sales(sale_date desc);
create index if not exists accountant_batches_date_idx on public.accountant_production_batches(batch_date desc);
create index if not exists accountant_movements_reference_idx on public.accountant_inventory_movements(reference_id);
create index if not exists accountant_movements_material_idx on public.accountant_inventory_movements(material_id);
create index if not exists accountant_batch_materials_material_idx on public.accountant_production_batch_materials(material_id);
create index if not exists accountant_audit_created_idx on public.accountant_audit_logs(created_at desc);

alter table public.accountant_expenses enable row level security;
alter table public.accountant_materials enable row level security;
alter table public.accountant_outside_sales enable row level security;
alter table public.accountant_production_batches enable row level security;
alter table public.accountant_production_batch_materials enable row level security;
alter table public.accountant_inventory_movements enable row level security;
alter table public.accountant_audit_logs enable row level security;

revoke all on table public.accountant_expenses from anon, authenticated;
revoke all on table public.accountant_materials from anon, authenticated;
revoke all on table public.accountant_outside_sales from anon, authenticated;
revoke all on table public.accountant_production_batches from anon, authenticated;
revoke all on table public.accountant_production_batch_materials from anon, authenticated;
revoke all on table public.accountant_inventory_movements from anon, authenticated;
revoke all on table public.accountant_audit_logs from anon, authenticated;
grant all on table public.accountant_expenses to service_role;
grant all on table public.accountant_materials to service_role;
grant all on table public.accountant_outside_sales to service_role;
grant all on table public.accountant_production_batches to service_role;
grant all on table public.accountant_production_batch_materials to service_role;
grant all on table public.accountant_inventory_movements to service_role;
grant all on table public.accountant_audit_logs to service_role;

create or replace function public.accountant_record_inventory_movement(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  movement_id uuid;
  material_uuid uuid;
  delta numeric;
begin
  material_uuid := nullif(p_payload->>'material_id', '')::uuid;
  delta := coalesce((p_payload->>'quantity_delta')::numeric, 0);
  insert into public.accountant_inventory_movements (idempotency_key, movement_type, reference_id, inventory_key, product_id, material_id, size_value, size_unit, quantity_delta, unit, unit_cost)
  values (p_payload->>'idempotency_key', p_payload->>'movement_type', p_payload->>'reference_id', p_payload->>'inventory_key', nullif(p_payload->>'product_id', ''), material_uuid, nullif(p_payload->>'size_value', '')::integer, nullif(p_payload->>'size_unit', ''), delta, coalesce(p_payload->>'unit', 'pieces'), coalesce((p_payload->>'unit_cost')::numeric, 0))
  on conflict (idempotency_key) do nothing
  returning id into movement_id;

  if movement_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  if material_uuid is not null then
    update public.accountant_materials
    set quantity = quantity + delta, updated_at = now()
    where id = material_uuid and quantity + delta >= 0;
    if not found then raise exception 'Insufficient raw material inventory'; end if;
  end if;
  return jsonb_build_object('duplicate', false, 'movementId', movement_id);
end;
$$;

create or replace function public.accountant_confirm_production_batch(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  batch_record jsonb := p_payload->'batch';
  batch_uuid uuid := (batch_record->>'id')::uuid;
  material_line jsonb;
  saved_batch public.accountant_production_batches;
begin
  insert into public.accountant_production_batches (id, product_id, size_value, size_unit, quantity_produced, raw_material_cost, packaging_cost, production_cost, cost_per_finished_product, batch_date, notes, status)
  values (batch_uuid, batch_record->>'product_id', (batch_record->>'size_value')::integer, batch_record->>'size_unit', (batch_record->>'quantity_produced')::integer, (batch_record->>'raw_material_cost')::numeric, (batch_record->>'packaging_cost')::numeric, (batch_record->>'production_cost')::numeric, (batch_record->>'cost_per_finished_product')::numeric, (batch_record->>'batch_date')::date, coalesce(batch_record->>'notes', ''), coalesce(batch_record->>'status', 'Confirmed'))
  on conflict (id) do nothing;

  for material_line in select * from jsonb_array_elements(coalesce(p_payload->'materials', '[]'::jsonb)) loop
    insert into public.accountant_production_batch_materials (batch_id, material_id, quantity_used, unit_cost, total_cost)
    values (batch_uuid, (material_line->>'material_id')::uuid, (material_line->>'quantity_used')::numeric, (material_line->>'unit_cost')::numeric, (material_line->>'total_cost')::numeric)
    on conflict (batch_id, material_id) do nothing;
    perform public.accountant_record_inventory_movement(jsonb_build_object('idempotency_key', 'batch:' || batch_uuid || ':material:' || (material_line->>'material_id'), 'movement_type', 'material_use', 'reference_id', batch_uuid::text, 'inventory_key', 'material:' || (material_line->>'material_id'), 'material_id', material_line->>'material_id', 'quantity_delta', -((material_line->>'quantity_used')::numeric), 'unit', 'material', 'unit_cost', material_line->>'unit_cost'));
  end loop;

  select * into saved_batch from public.accountant_production_batches where id = batch_uuid;
  return to_jsonb(saved_batch);
end;
$$;

revoke all on function public.accountant_record_inventory_movement(jsonb) from public, anon, authenticated;
revoke all on function public.accountant_confirm_production_batch(jsonb) from public, anon, authenticated;
grant execute on function public.accountant_record_inventory_movement(jsonb) to service_role;
grant execute on function public.accountant_confirm_production_batch(jsonb) to service_role;

