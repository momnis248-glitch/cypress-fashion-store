# Cypress Fashion Store

English + Khmer Telegram Mini App storefront. The checkout does **not** use ABA or any payment gateway. Instead, the bot sends a payment QR image and the order number directly to the customer in Telegram. Payment must be reviewed and confirmed manually in the admin workflow.

## Run locally

Install Node.js 18 or newer, then run from this folder:

```bash
BOT_TOKEN="your-secret-token" PAYMENT_QR_FILE_ID="telegram-file-id" ADMIN_KEY="choose-a-strong-password" ALLOW_DEMO_ORDERS=true node server.mjs
```

Open `http://localhost:3000`. `ALLOW_DEMO_ORDERS` lets browser testing work without opening through Telegram. Do not use it in production.

## Connect the bot and QR image

1. Open a private chat with `@Cypress11_bot` and send any message.
2. Send your payment QR image to the bot. On your own computer or server, run `BOT_TOKEN="..." node get-qr-file-id.mjs`; it prints the `PAYMENT_QR_FILE_ID` to place in your server settings.
3. Set `BOT_TOKEN` only in the server environment—never in the website, source code, or chat.
4. Deploy this folder to a host that runs Node.js and provides HTTPS. Set `BOT_TOKEN`, `PAYMENT_QR_FILE_ID`, and `ADMIN_KEY` in that host's secret/environment-variable settings.
5. In BotFather → **Mini Apps**, add the HTTPS storefront URL to `@Cypress11_bot`.

When customers tap **Request payment QR**, the server verifies Telegram's signed Mini App data, creates an order in `data/orders.json`, and calls Telegram's `sendPhoto` API. The bot sends the QR image with the exact total, order number, delivery method, and payment-confirmation instructions.

## Admin settings

The Admin screen edits pickup address and delivery fees. To save them on the server it asks for `ADMIN_KEY`; the server writes them to `data/settings.json`. This is a lightweight starting point. Before public launch, add proper staff accounts and a real database. A hosting filesystem can be temporary, so production orders should move to PostgreSQL rather than `data/orders.json`.
