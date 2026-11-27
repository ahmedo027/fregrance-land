alter table public.accountant_outside_sales
  add column if not exists customer_region text not null default 'AE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accountant_outside_sales_customer_region_check'
      and conrelid = 'public.accountant_outside_sales'::regclass
  ) then
    alter table public.accountant_outside_sales
      add constraint accountant_outside_sales_customer_region_check
      check (customer_region in ('AE', 'OTHER'));
  end if;
end $$;

alter table public.accountant_outside_sales
  add column if not exists stripe_fee numeric(14,2) not null default 0 check (stripe_fee >= 0);

alter table public.accountant_outside_sales
  add column if not exists shipping_fee numeric(14,2) not null default 0 check (shipping_fee >= 0);
