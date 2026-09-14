-- Run once in Supabase SQL Editor before using product video uploads.
-- Product images are stored in image_url (primary) and image_urls (ordered gallery).

alter table public.products
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists video_url text not null default '';

update public.products
set image_urls = array[image_url]
where coalesce(array_length(image_urls, 1), 0) = 0
  and coalesce(image_url, '') <> '';

update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','video/mp4','video/webm']
where id = 'products';
