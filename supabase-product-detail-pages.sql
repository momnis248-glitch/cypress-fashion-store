-- Run once in Supabase SQL Editor to enable product long-detail images.
-- The array preserves the order in which the admin uploads the images.

alter table public.products
  add column if not exists detail_image_urls text[] not null default '{}';
