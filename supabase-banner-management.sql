-- Run once in Supabase SQL Editor before using Banner Management.
-- Banner image files are kept in the existing public `products` storage bucket;
-- this table stores only their URLs, enabled state, order, and optional link.
alter table public.store_settings
  add column if not exists banners jsonb not null default '[]'::jsonb;

update public.store_settings
  set banners = '[]'::jsonb
  where banners is null;
