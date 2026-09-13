-- Cypress Fashion Store: run this once in the Supabase SQL Editor.
-- Payment proof + manual payment confirmation. Stock and sales are only updated
-- when an administrator confirms payment.

begin;

create table if not exists public.order_number_counters (
  order_day date primary key,
  next_number integer not null default 0
);

alter table public.orders
  add column if not exists payment_proof_file_id text,
  add column if not exists payment_proof_mime_type text,
  add column if not exists payment_proof_at timestamptz,
  add column if not exists payment_confirmed_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in (
    'awaiting_payment', 'payment_proof_uploaded', 'payment_rejected',
    'paid', 'processing', 'shipping', 'ready_for_pickup', 'completed', 'cancelled'
  )
);

create or replace function public.create_pending_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_day_value date := timezone('Asia/Phnom_Penh', now())::date;
  sequence_value integer;
  inserted_order public.orders%rowtype;
begin
  insert into public.order_number_counters (order_day, next_number)
  values (order_day_value, 1)
  on conflict (order_day) do update
    set next_number = public.order_number_counters.next_number + 1
  returning next_number into sequence_value;

  insert into public.orders (
    order_number, telegram_user_id, customer_name, contact, address, delivery, region,
    items, subtotal, shipping, total, status
  ) values (
    format('ORDER-%s-%s', to_char(order_day_value, 'YYYYMMDD'), lpad(sequence_value::text, 4, '0')),
    p_order->>'telegram_user_id', p_order->>'customer_name', p_order->>'contact',
    coalesce(p_order->>'address', ''), p_order->>'delivery', coalesce(p_order->>'region', ''),
    p_order->'items', (p_order->>'subtotal')::numeric, (p_order->>'shipping')::numeric,
    (p_order->>'total')::numeric, 'awaiting_payment'
  ) returning * into inserted_order;

  return to_jsonb(inserted_order);
end;
$$;

create or replace function public.confirm_order_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item jsonb;
  product_row public.products%rowtype;
  sku text;
  requested integer;
  remaining integer;
  sold integer;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  if order_row.status <> 'payment_proof_uploaded' then
    raise exception 'A payment proof must be uploaded before payment can be confirmed.';
  end if;

  for item in select value from jsonb_array_elements(order_row.items) loop
    select * into product_row from public.products where id = (item->>'id')::uuid for update;
    if not found then raise exception 'A product in this order no longer exists.'; end if;
    if coalesce(product_row.variant_sale_types->>coalesce(nullif(item->>'sku', ''), 'default'), product_row.sale_type, 'preorder') = 'in_stock' then
      sku := coalesce(nullif(item->>'sku', ''), 'default');
      requested := greatest(1, coalesce((item->>'quantity')::integer, 0));
      remaining := coalesce((product_row.stock_by_sku->>sku)::integer, 0);
      if remaining < requested then
        raise exception 'Insufficient stock for %.', product_row.name_en;
      end if;
      sold := coalesce((product_row.sold_by_sku->>sku)::integer, 0);
      update public.products
      set stock_by_sku = jsonb_set(stock_by_sku, array[sku], to_jsonb(remaining - requested), true),
          sold_by_sku = jsonb_set(sold_by_sku, array[sku], to_jsonb(sold + requested), true)
      where id = product_row.id;
    end if;
  end loop;

  update public.orders
  set status = 'paid', payment_confirmed_at = now(), inventory_reversed = false
  where id = p_order_id
  returning * into order_row;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.cancel_order_safely(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item jsonb;
  product_row public.products%rowtype;
  sku text;
  quantity integer;
  remaining integer;
  sold integer;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  if order_row.status = 'cancelled' then return to_jsonb(order_row); end if;

  if order_row.status in ('paid', 'processing', 'shipping', 'ready_for_pickup', 'completed') then
    for item in select value from jsonb_array_elements(order_row.items) loop
      if coalesce(item->>'sale_type', 'preorder') = 'in_stock' then
        select * into product_row from public.products where id = (item->>'id')::uuid for update;
        if found then
          sku := coalesce(nullif(item->>'sku', ''), 'default');
          quantity := greatest(1, coalesce((item->>'quantity')::integer, 0));
          remaining := coalesce((product_row.stock_by_sku->>sku)::integer, 0);
          sold := coalesce((product_row.sold_by_sku->>sku)::integer, 0);
          update public.products
          set stock_by_sku = jsonb_set(stock_by_sku, array[sku], to_jsonb(remaining + quantity), true),
              sold_by_sku = jsonb_set(sold_by_sku, array[sku], to_jsonb(greatest(0, sold - quantity)), true)
          where id = product_row.id;
        end if;
      end if;
    end loop;
  end if;

  update public.orders set status = 'cancelled', inventory_reversed = true where id = p_order_id returning * into order_row;
  return to_jsonb(order_row);
end;
$$;

grant select, insert, update, delete on table public.order_number_counters to service_role;
grant execute on function public.create_pending_order(jsonb) to service_role;
grant execute on function public.confirm_order_payment(uuid) to service_role;
grant execute on function public.cancel_order_safely(uuid) to service_role;

commit;
