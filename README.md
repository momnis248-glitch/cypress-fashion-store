# Cypress Fashion Store

English + Khmer Telegram Mini App storefront with Supabase-backed products, image uploads, home-page settings, orders, and a manually confirmed KHQR payment flow.

## One-time Supabase setup

1. In the new Supabase project, open **SQL Editor** → **New query**.
2. Paste and run [`supabase-setup.sql`](supabase-setup.sql).
3. In Supabase **Project Settings** → **API**, copy the Project URL and the **service_role** secret key. Keep the service-role key private.
4. In Render → **Environment**, add these two secrets:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
```

Do not put either key in `app.js`, GitHub source, or a Telegram message.

## Render variables

The service also needs the existing private variables:

```text
BOT_TOKEN=...
ADMIN_KEY=...
```

`BOT_TOKEN` sends the payment QR to the customer after checkout. `ADMIN_KEY` protects the store-management actions. The code uses `payment-qr.png` automatically; it can also use `PAYMENT_QR_FILE_ID` or `PAYMENT_QR_IMAGE_URL` if supplied.

## Store management

Open the Mini App → **Admin**. Enter `ADMIN_KEY` when prompted to:

- upload PNG, JPG, or WebP product images (up to 5 MB);
- add product names, descriptions, category, price, visibility, and featured status;
- change homepage English/Khmer text, pickup address, and delivery fees;
- view orders and update their status after payment proof is checked manually.

The front-end never receives the Supabase service-role key. All database and image-upload requests are made by the Node server.
