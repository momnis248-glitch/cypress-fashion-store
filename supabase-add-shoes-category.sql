-- Cypress Fashion Store: run this once in the Supabase SQL Editor.
-- Extends the existing category check; no products or order data are changed.

alter table public.products
  drop constraint if exists products_category_check;

alter table public.products
  add constraint products_category_check
  check (category in ('clothes', 'bags', 'shoes', 'charms'));
