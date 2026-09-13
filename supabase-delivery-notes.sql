-- Run once in the Supabase SQL Editor for delivery-note settings.
alter table public.store_settings
  add column if not exists default_delivery_notes jsonb not null default '{}'::jsonb;

alter table public.products
  add column if not exists delivery_notes jsonb not null default '{}'::jsonb;

-- Keep existing products on the global default. Only products explicitly edited
-- with their own delivery note will store content in products.delivery_notes.
update public.store_settings
set default_delivery_notes = jsonb_build_object(
  'en', 'Pre-order: Delivery in 15–18 days after placing the order.' || E'\n' ||
        'In Stock – Delivery: Delivery in 3–4 days.' || E'\n' ||
        'Self-Pickup: Available after work the next day.' || E'\n' ||
        'Pickup Location: Security Room at T20 Factory.',
  'km', 'ទំនិញបញ្ជាទិញមុន (Pre-order): ទទួលបានទំនិញក្នុងរយៈពេល 15–18 ថ្ងៃ បន្ទាប់ពីធ្វើការបញ្ជាទិញ។' || E'\n' ||
        'ទំនិញមានស្តុក – ដឹកជញ្ជូន: ទទួលបានទំនិញក្នុងរយៈពេល 3–4 ថ្ងៃ។' || E'\n' ||
        'មកយកដោយខ្លួនឯង: អាចមកយកបានបន្ទាប់ពីចេញពីធ្វើការនៅថ្ងៃបន្ទាប់។' || E'\n' ||
        'ទីតាំងមកយក: បន្ទប់សន្តិសុខនៅរោងចក្រ T20។'
)
where id = 1
  and (default_delivery_notes is null or default_delivery_notes = '{}'::jsonb);
