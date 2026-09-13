-- Run once in Supabase SQL Editor after the inventory migration.
alter table public.orders
  add column if not exists inventory_reversed boolean not null default false;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting_payment', 'paid', 'shipping', 'ready_for_pickup', 'completed', 'cancelled'));

create or replace function public.cancel_order_with_inventory(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare order_row public.orders%rowtype; item jsonb; sku text; quantity integer; remaining integer;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order was not found.'; end if;
  if order_row.status = 'cancelled' then return to_jsonb(order_row); end if;
  if not order_row.inventory_reversed then
    for item in select value from jsonb_array_elements(order_row.items) loop
      if coalesce(item->>'sale_type', 'preorder') = 'in_stock' then
        sku := coalesce(nullif(item->>'sku', ''), 'default');
        quantity := greatest(1, coalesce((item->>'quantity')::integer, 0));
        select coalesce((stock_by_sku->>sku)::integer, 0) into remaining from public.products where id = (item->>'id')::uuid for update;
        update public.products set stock_by_sku = jsonb_set(stock_by_sku, array[sku], to_jsonb(remaining + quantity), true) where id = (item->>'id')::uuid;
      end if;
    end loop;
  end if;
  update public.orders set status = 'cancelled', inventory_reversed = true where id = p_order_id returning * into order_row;
  return to_jsonb(order_row);
end; $$;

grant execute on function public.cancel_order_with_inventory(uuid) to service_role;
