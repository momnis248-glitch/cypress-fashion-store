-- Run once in Supabase SQL Editor before deploying the pre-order / stock update.
alter table public.products
  add column if not exists sale_type text not null default 'preorder' check (sale_type in ('in_stock', 'preorder')),
  add column if not exists stock_by_sku jsonb not null default '{}'::jsonb,
  add column if not exists sold_by_sku jsonb not null default '{}'::jsonb;

-- Existing products remain purchasable as pre-orders until you change them in Admin.
update public.products set sale_type = 'preorder' where sale_type is null;

create or replace function public.create_order_with_inventory(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  sku text;
  requested integer;
  remaining integer;
  sold integer;
  inserted_order public.orders%rowtype;
begin
  for item in select value from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) loop
    select * into product_row from public.products where id = (item->>'id')::uuid for update;
    if not found then raise exception 'A product is no longer available.'; end if;
    if product_row.sale_type = 'in_stock' then
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

  insert into public.orders (
    order_number, telegram_user_id, customer_name, contact, address, delivery, region,
    items, subtotal, shipping, total, status
  ) values (
    p_order->>'order_number', p_order->>'telegram_user_id', p_order->>'customer_name',
    p_order->>'contact', coalesce(p_order->>'address', ''), p_order->>'delivery',
    coalesce(p_order->>'region', ''), p_order->'items', (p_order->>'subtotal')::numeric,
    (p_order->>'shipping')::numeric, (p_order->>'total')::numeric,
    coalesce(p_order->>'status', 'awaiting_payment')
  ) returning * into inserted_order;

  return to_jsonb(inserted_order);
end;
$$;

grant execute on function public.create_order_with_inventory(jsonb) to service_role;
