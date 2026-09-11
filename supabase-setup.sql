-- Cypress Fashion Store: run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  pickup text not null default 'TG Factory #4',
  shipping jsonb not null default '{"Phnom Penh":"$2.00","Other provinces":"$3.50","Remote areas":"$5.00"}'::jsonb,
  hero_en text not null default 'A little light, for every day.',
  hero_km text not null default 'សម្រស់តិចៗ សម្រាប់រាល់ថ្ងៃ។',
  hero_text_en text not null default 'Curated clothing and bags. Prices are in USD. Delivery or pickup available.',
  hero_text_km text not null default 'សម្លៀកបំពាក់ និងកាបូបដែលបានជ្រើសរើស។ តម្លៃគិតជា USD។ មានដឹកជញ្ជូន ឬមកយកផ្ទាល់។',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_km text not null default '',
  description_en text not null default '',
  description_km text not null default '',
  category text not null check (category in ('clothes', 'bags')),
  price numeric(10,2) not null check (price >= 0),
  image_url text not null,
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
  created_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

-- The public site calls the application server, not these tables directly.
-- No browser policies are intentionally added; service-role server calls bypass RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
