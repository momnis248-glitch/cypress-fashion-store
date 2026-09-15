-- Cypress Fashion Store: Cost price + separate Pre-order / In Stock prices.
-- Run this once in Supabase SQL Editor before using the new price fields.
-- Existing products intentionally keep using their current `price` value.

begin;

alter table public.products
  add column if not exists cost_price numeric,
  add column if not exists preorder_price numeric,
  add column if not exists instock_price numeric,
  add column if not exists instock_quantity integer not null default 0;

alter table public.products
  drop constraint if exists products_cost_price_nonnegative,
  drop constraint if exists products_preorder_price_nonnegative,
  drop constraint if exists products_instock_price_nonnegative,
  drop constraint if exists products_instock_quantity_nonnegative;

alter table public.products
  add constraint products_cost_price_nonnegative check (cost_price is null or cost_price >= 0),
  add constraint products_preorder_price_nonnegative check (preorder_price is null or preorder_price >= 0),
  add constraint products_instock_price_nonnegative check (instock_price is null or instock_price >= 0),
  add constraint products_instock_quantity_nonnegative check (instock_quantity >= 0);

-- Formal sales and inventory deduction occur only after an administrator
-- confirms payment. `item.sale_type` is authoritative for the chosen price
-- type; legacy orders without it retain the old variant behaviour.
create or replace function public.confirm_order_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  order_row public.orders%rowtype;
  item jsonb;
  product_row public.products%rowtype;
  sku text;
  selected_type text;
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
    selected_type := coalesce(nullif(item->>'sale_type', ''), product_row.variant_sale_types->>coalesce(nullif(item->>'sku', ''), 'default'), product_row.sale_type, 'preorder');
    if selected_type = 'in_stock' then
      sku := coalesce(nullif(item->>'sku', ''), 'default');
      requested := greatest(1, coalesce((item->>'quantity')::integer, 0));
      remaining := coalesce((product_row.stock_by_sku->>sku)::integer, case when sku = 'default' then product_row.instock_quantity else 0 end, 0);
      if remaining < requested then raise exception 'Insufficient stock for %.', product_row.name_en; end if;
      sold := coalesce((product_row.sold_by_sku->>sku)::integer, 0);
      update public.products set
        stock_by_sku = jsonb_set(coalesce(stock_by_sku, '{}'::jsonb), array[sku], to_jsonb(remaining - requested), true),
        sold_by_sku = jsonb_set(coalesce(sold_by_sku, '{}'::jsonb), array[sku], to_jsonb(sold + requested), true),
        instock_quantity = case when sku = 'default' then remaining - requested else instock_quantity end
      where id = product_row.id;
    end if;
  end loop;
  update public.orders set status = 'paid', payment_confirmed_at = now(), inventory_reversed = false
  where id = p_order_id returning * into order_row;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.cancel_order_safely(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
          remaining := coalesce((product_row.stock_by_sku->>sku)::integer, case when sku = 'default' then product_row.instock_quantity else 0 end, 0);
          sold := coalesce((product_row.sold_by_sku->>sku)::integer, 0);
          update public.products set
            stock_by_sku = jsonb_set(coalesce(stock_by_sku, '{}'::jsonb), array[sku], to_jsonb(remaining + quantity), true),
            sold_by_sku = jsonb_set(coalesce(sold_by_sku, '{}'::jsonb), array[sku], to_jsonb(greatest(0, sold - quantity)), true),
            instock_quantity = case when sku = 'default' then remaining + quantity else instock_quantity end
          where id = product_row.id;
        end if;
      end if;
    end loop;
  end if;
  update public.orders set status = 'cancelled', inventory_reversed = true where id = p_order_id returning * into order_row;
  return to_jsonb(order_row);
end;
$$;

grant execute on function public.confirm_order_payment(uuid) to service_role;
grant execute on function public.cancel_order_safely(uuid) to service_role;

commit;
