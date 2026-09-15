-- Cypress Fashion Store: run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  pickup text not null default 'TG Factory #4',
  shipping jsonb not null default '{"Phnom Penh":"$2.00","Other provinces":"$3.50","Remote areas":"$5.00"}'::jsonb,
  free_shipping_threshold numeric(10,2) not null default 25,
  hero_en text not null default 'A little light, for every day.',
  hero_km text not null default 'សម្រស់តិចៗ សម្រាប់រាល់ថ្ងៃ។',
  new_arrival_en text not null default 'New arrival',
  new_arrival_km text not null default 'ទំនិញថ្មី',
  hero_text_en text not null default 'Curated clothing and bags. Prices are in USD. Delivery or pickup available.',
  hero_text_km text not null default 'សម្លៀកបំពាក់ និងកាបូបដែលបានជ្រើសរើស។ តម្លៃគិតជា USD។ មានដឹកជញ្ជូន ឬមកយកផ្ទាល់។',
  default_delivery_notes jsonb not null default '{}'::jsonb,
  owner_telegram_chat_id text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_km text not null default '',
  description_en text not null default '',
  description_km text not null default '',
  category text not null check (category in ('clothes', 'bags', 'shoes', 'charms')),
  price numeric(10,2) not null check (price >= 0),
  sizes text[] not null default '{}',
  size_guides jsonb not null default '{}'::jsonb,
  colors text[] not null default '{}',
  color_images jsonb not null default '{}'::jsonb,
  sale_type text not null default 'preorder' check (sale_type in ('in_stock', 'preorder')),
  stock_by_sku jsonb not null default '{}'::jsonb,
  sold_by_sku jsonb not null default '{}'::jsonb,
  variant_sale_types jsonb not null default '{}'::jsonb,
  excludes_charms boolean not null default false,
  image_url text not null,
  image_urls text[] not null default '{}',
  detail_image_urls text[] not null default '{}',
  video_url text not null default '',
  detail_image_url text not null default '',
  delivery_notes jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  telegram_user_id text not null,
  customer_name text not null,
  contact text not null,
  address text not null default '',
  delivery text not null check (delivery in ('delivery', 'pickup')),
  region text not null default '',
  items jsonb not null,
  subtotal numeric(10,2) not null,
  shipping numeric(10,2) not null,
  total numeric(10,2) not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'shipping', 'ready_for_pickup', 'completed', 'cancelled')),
  inventory_reversed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

-- The public site calls the application server, not these tables directly.
-- No browser policies are intentionally added; service-role server calls bypass RLS.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.store_settings, public.products, public.orders to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 10485760, array['image/png','image/jpeg','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/png','image/jpeg','image/webp','video/mp4','video/webm'];
