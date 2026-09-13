import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = process.cwd();
const defaults = {
  pickup: 'TG Factory #4', shipping: { 'Phnom Penh': '$2.00', 'Other provinces': '$3.50', 'Remote areas': '$5.00' }, free_shipping_threshold: 25,
  hero_en: 'A little light, for every day.', hero_km: 'សម្រស់តិចៗ សម្រាប់រាល់ថ្ងៃ។',
  new_arrival_en: 'New arrival', new_arrival_km: 'ទំនិញថ្មី',
  hero_text_en: 'Curated clothing and bags. Prices are in USD. Delivery or pickup available.',
  hero_text_km: 'សម្លៀកបំពាក់ និងកាបូបដែលបានជ្រើសរើស។ តម្លៃគិតជា USD។ មានដឹកជញ្ជូន ឬមកយកផ្ទាល់។',
  default_delivery_notes: {
    en: 'Pre-order: Delivery in 15–18 days after placing the order.\nIn Stock – Delivery: Delivery in 3–4 days.\nSelf-Pickup: Available after work the next day.\nPickup Location: Security Room at T20 Factory.',
    km: 'ទំនិញបញ្ជាទិញមុន (Pre-order): ទទួលបានទំនិញក្នុងរយៈពេល 15–18 ថ្ងៃ បន្ទាប់ពីធ្វើការបញ្ជាទិញ។\nទំនិញមានស្តុក – ដឹកជញ្ជូន: ទទួលបានទំនិញក្នុងរយៈពេល 3–4 ថ្ងៃ។\nមកយកដោយខ្លួនឯង: អាចមកយកបានបន្ទាប់ពីចេញពីធ្វើការនៅថ្ងៃបន្ទាប់។\nទីតាំងមកយក: បន្ទប់សន្តិសុខនៅរោងចក្រ T20។'
  }
};
const sendJson = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 22_000_000) reject(Error('Request too large')); }); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(Error('Invalid JSON')); } }); });
const cookieValue = (req, name) => String(req.headers.cookie || '').split(';').map(item => item.trim().split('=')).find(([key]) => key === name)?.slice(1).join('=') || '';
function secureEqual(left, right) { const a = Buffer.from(String(left)), b = Buffer.from(String(right)); return a.length === b.length && timingSafeEqual(a, b); }
function adminSessionToken() { return createHmac('sha256', process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_KEY || '').update('cypress-fashion-store-admin-session-v1').digest('hex'); }
const admin = req => Boolean(process.env.ADMIN_KEY) && secureEqual(cookieValue(req, 'cypress_admin_session'), adminSessionToken());
const adminSessionCookie = () => `cypress_admin_session=${adminSessionToken()}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const clearAdminSessionCookie = () => 'cypress_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
const supabaseReady = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
function supabase(path, options = {}) {
  if (!supabaseReady()) throw Error('Supabase is not configured on the server.');
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, ...(options.headers || {}) } });
}
async function db(path, options = {}) { const response = await supabase(path, options); if (!response.ok) throw Error(`Database request failed (${response.status}).`); const text = await response.text(); return text ? JSON.parse(text) : null; }
function verifyTelegramInitData(initData) {
  if (process.env.ALLOW_DEMO_ORDERS === 'true' && !initData) return { id: 'demo-user' };
  if (!process.env.BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData); const hash = params.get('hash'); if (!hash) return null; params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest(); const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}
async function telegramApi(method, payload) {
  if (!process.env.BOT_TOKEN) throw Error('BOT_TOKEN is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw Error(`Telegram ${method} failed.`);
  return response.json();
}
function telegramWebhookSecret() { return process.env.TELEGRAM_WEBHOOK_SECRET || createHmac('sha256', process.env.BOT_TOKEN || '').update('cypress-payment-proof').digest('hex'); }
async function ensureTelegramWebhook() {
  const base = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (!base || !process.env.BOT_TOKEN) return;
  await telegramApi('setWebhook', { url: `${base}/api/telegram/webhook`, allowed_updates: ['message'], secret_token: telegramWebhookSecret() });
}
async function getOwnerChatId() {
  if (process.env.OWNER_TELEGRAM_CHAT_ID) return String(process.env.OWNER_TELEGRAM_CHAT_ID);
  const settings = await db('store_settings?select=owner_telegram_chat_id&id=eq.1');
  return String(settings?.[0]?.owner_telegram_chat_id || '');
}
async function forwardPaymentProof(message) {
  const file = message.photo?.at(-1) || message.document;
  const fileId = String(file?.file_id || '');
  const mimeType = String(message.document?.mime_type || 'image/jpeg');
  const sender = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Customer';
  const username = message.from?.username ? `@${message.from.username}` : 'No username';
  const note = [message.caption, message.reply_to_message?.caption, message.reply_to_message?.text].filter(Boolean).join('\n');
  const match = note.match(/\b(?:ORDER-\d{8}-\d{4,}|CYP-[A-Z0-9-]{6,})\b/i);
  const customerId = String(message.from?.id || '');
  let order = null;
  if (match && customerId) {
    const rows = await db(`orders?select=*&order_number=eq.${encodeURIComponent(match[0].toUpperCase())}&telegram_user_id=eq.${encodeURIComponent(customerId)}&limit=1`);
    order = rows?.[0] || null;
  }
  if (!order && customerId) {
    const pending = await db(`orders?select=*&telegram_user_id=eq.${encodeURIComponent(customerId)}&status=in.(awaiting_payment,payment_rejected)&order=created_at.desc&limit=2`);
    if (pending?.length === 1) order = pending[0];
  }
  if (order && fileId) {
    const saved = await db(`orders?id=eq.${order.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'payment_proof_uploaded', payment_proof_file_id: fileId, payment_proof_mime_type: mimeType, payment_proof_at: new Date().toISOString() }) });
    order = saved?.[0] || order;
  }
  const ownerChatId = await getOwnerChatId();
  if (ownerChatId) {
    await telegramApi('sendMessage', { chat_id: ownerChatId, text: `💳 New payment proof\nCustomer: ${sender} (${username})\nCustomer chat: ${message.chat.id}\nOrder: ${order?.order_number || 'No matching order found'}\n${order ? 'Saved in Orders — waiting for manual confirmation.' : 'Ask the customer to reply to the payment QR or include the order number.'}` });
    await telegramApi('forwardMessage', { chat_id: ownerChatId, from_chat_id: message.chat.id, message_id: message.message_id });
  }
  await telegramApi('sendMessage', { chat_id: message.chat.id, text: order ? `Payment proof for ${order.order_number} received. The store will check it and confirm your order.\nបានទទួលភស្តុតាងការបង់ប្រាក់សម្រាប់ ${order.order_number} ហើយ។ ហាងនឹងពិនិត្យ និងបញ្ជាក់ការបញ្ជាទិញរបស់អ្នក។` : 'We could not match this payment proof to an order. Please reply to the payment QR or send your order number with the screenshot.\nមិនអាចរកឃើញលេខបញ្ជាទិញបានទេ។ សូមឆ្លើយតបទៅ QR បង់ប្រាក់ ឬផ្ញើលេខបញ្ជាទិញជាមួយរូបភាព។' });
}
async function notifyOrderStatus(order) {
  if (!process.env.BOT_TOKEN || !/^\d+$/.test(String(order?.telegram_user_id || ''))) return;
  const messages = {
    awaiting_payment: `您的订单 ${order.order_number} 正在等待付款确认。\nការបញ្ជាទិញ ${order.order_number} កំពុងរង់ចាំការបញ្ជាក់ការបង់ប្រាក់។`,
    paid: `您的订单 ${order.order_number} 已付款，正在准备订单。\nការបញ្ជាទិញ ${order.order_number} បានបញ្ជាក់ការបង់ប្រាក់ ហើយហាងកំពុងរៀបចំ។`,
    shipping: `您的订单 ${order.order_number} 已发货，预计12-18天送达。\nការបញ្ជាទិញ ${order.order_number} បានដឹកចេញហើយ។ រំពឹងថានឹងដល់ក្នុងរយៈពេល 12-18 ថ្ងៃ។`,
    ready_for_pickup: `您的订单 ${order.order_number} 已送达，自提请在四号厂房一楼会议室取货。\nការបញ្ជាទិញ ${order.order_number} បានដល់ហើយ។ សម្រាប់មកយកផ្ទាល់ សូមមកបន្ទប់ប្រជុំជាន់ទី 1 អគារ #4។`,
    completed: `您的订单 ${order.order_number} 已确认收货，感谢您的购买。\nការបញ្ជាទិញ ${order.order_number} បានបញ្ជាក់ថាទទួលរួចហើយ។ សូមអរគុណសម្រាប់ការទិញ。`,
    cancelled: `您的订单 ${order.order_number} 已取消。\nការបញ្ជាទិញ ${order.order_number} ត្រូវបានលុបចោល។`
  };
  messages.payment_proof_uploaded = 'Payment proof received. Your order is waiting for manual confirmation.\nបានទទួលភស្តុតាងការបង់ប្រាក់ ហើយកំពុងរង់ចាំការបញ្ជាក់។';
  messages.payment_rejected = `Your payment proof for ${order.order_number} was not approved. Please pay again or upload a new proof.\nភស្តុតាងការបង់ប្រាក់សម្រាប់ ${order.order_number} មិនត្រូវបានអនុម័តទេ។ សូមផ្ទុកឡើងវិញ។`;
  messages.processing = `Your order ${order.order_number} is being prepared.\nការបញ្ជាទិញ ${order.order_number} កំពុងរៀបចំ។`;
  messages.paid = `Payment confirmed ✅\nYour order ${order.order_number} has been confirmed.\n${(order.items || []).some(item => item.sale_type === 'preorder') ? 'Pre-order: Delivery in 15–18 days after placing the order.' : order.delivery === 'pickup' ? 'Self-Pickup: Available after work the next day. Pickup Location: Security Room at T20 Factory.' : 'In Stock – Delivery: Delivery in 3–4 days.'}`;
  await telegramApi('sendMessage', { chat_id: order.telegram_user_id, text: `Order ${order.order_number}\n${messages[order.status] || 'Your order status was updated.'}` });
}
async function sendPaymentQr(chatId, order) {
  if (!process.env.BOT_TOKEN) throw Error('BOT_TOKEN is not configured.');
  await ensureTelegramWebhook().catch(error => console.error(error.message));
  const photo = process.env.PAYMENT_QR_FILE_ID || process.env.PAYMENT_QR_IMAGE_URL || `${process.env.RENDER_EXTERNAL_URL}/payment-qr.png`;
  const items = (order.items || []).map(item => `• ${item.quantity} × ${item.name}${item.color ? ` (${item.color}${item.size ? ` / ${item.size}` : ''})` : item.size ? ` (${item.size})` : ''}`).join('\n');
  const caption = ['Payment QR / QR កូដបង់ប្រាក់', '', `Order: ${order.order_number}`, items, `Total: $${Number(order.total).toFixed(2)}`, order.delivery === 'pickup' ? 'Pickup / មកយកផ្ទាល់' : 'Delivery / ដឹកជញ្ជូន', '', 'Please scan the QR code to complete payment. After payment, reply to this message with your payment screenshot.', 'សូមស្កេន QR ដើម្បីបង់ប្រាក់ ហើយឆ្លើយតបសារនេះជាមួយរូបភាពបញ្ជាក់ការបង់ប្រាក់។'].filter(Boolean).join('\n').slice(0, 1024);
  await telegramApi('sendPhoto', { chat_id: chatId, photo, caption });
}
async function publishProductToChannel(product) {
  // A public channel username can be used as the Bot API chat_id. Keep the
  // environment overrides so the shop can be moved to another channel later.
  if (!process.env.BOT_TOKEN || !product?.published || !product?.image_url) return;
  const channel = String(process.env.TELEGRAM_CHANNEL_USERNAME || '@cypress1111').trim();
  const bot = String(process.env.STORE_BOT_USERNAME || 'Cypress11_bot').replace(/^@/, '').trim();
  if (!channel || !bot) return;
  const caption = [
    '🛍 New product / ផលិតផលថ្មី',
    product.name_en,
    product.name_km,
    `💵 $${Number(product.price).toFixed(2)}`,
    product.description_en
  ].filter(Boolean).join('\n').slice(0, 1024);
  await telegramApi('sendPhoto', {
    chat_id: channel,
    photo: product.image_url,
    caption,
    reply_markup: { inline_keyboard: [[{
      text: '🛒 View Product / 查看商品',
      url: `https://t.me/${bot}?startapp=product_${product.id}`
    }]] }
  });
}
async function uploadProductImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ''); if (!match) throw Error('Use a PNG, JPG, or WebP image.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]]; const name = `${randomUUID()}.${extension}`;
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/products/${name}`, { method: 'PUT', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': match[1], 'x-upsert': 'false' }, body: Buffer.from(match[2], 'base64') });
  if (!response.ok) throw Error('Image upload failed.'); return `${process.env.SUPABASE_URL}/storage/v1/object/public/products/${name}`;
}
function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function cleanDeliveryNotes(value) { const notes = plainObject(value); return { en: String(notes.en || '').trim().slice(0, 1600), km: String(notes.km || '').trim().slice(0, 1600) }; }
function cleanSizeGuides(value, sizes) {
  const guides = plainObject(value);
  return Object.fromEntries(sizes.map(size => {
    const guide = plainObject(guides[size]);
    return [size, {
      waist: String(guide.waist || '').trim().slice(0, 80),
      length: String(guide.length || '').trim().slice(0, 80),
      recommendation: String(guide.recommendation || '').trim().slice(0, 120)
    }];
  }));
}
function keptColorImages(value, colors) {
  const images = plainObject(value);
  return Object.fromEntries(colors.map(color => [color, String(images[color] || '').trim().slice(0, 2000)]).filter(([, url]) => url));
}
async function productColorImages(value, colors, current) {
  const uploads = plainObject(value), images = { ...current };
  for (const color of colors) if (uploads[color]) images[color] = await uploadProductImage(uploads[color]);
  return Object.fromEntries(colors.map(color => [color, images[color]]).filter(([, url]) => url));
}
async function productImages(input) {
  const uploads = Array.isArray(input.imageDataList) ? input.imageDataList : [];
  const legacy = input.imageData ? [input.imageData] : [];
  const supplied = [...uploads, ...legacy].filter(Boolean).slice(0, 3);
  if (supplied.length) return Promise.all(supplied.map(uploadProductImage));
  const existing = Array.isArray(input.image_urls) ? input.image_urls : [];
  return existing.filter(Boolean).slice(0, 3).concat(existing.length ? [] : [String(input.image_url || '')]).filter(Boolean).slice(0, 3);
}
function productInput(input) { const name_en = String(input.name_en || '').trim(), price = Number(input.price), category = ['clothes', 'bags', 'charms'].includes(input.category) ? input.category : 'clothes', requestedSizes = Array.isArray(input.sizes) ? input.sizes : String(input.sizes || '').split(','), requestedColors = Array.isArray(input.colors) ? input.colors : String(input.colors || '').split(','), sizes = category === 'clothes' ? requestedSizes.map(size => String(size).trim()).filter(Boolean).slice(0, 20) : [], colors = requestedColors.map(color => String(color).trim()).filter(Boolean).slice(0, 30); if (!name_en || !Number.isFinite(price) || price < 0) throw Error('Product name and price are required.'); return { name_en, name_km: String(input.name_km || '').trim(), description_en: String(input.description_en || '').trim(), description_km: String(input.description_km || '').trim(), category, price, sizes, colors, size_guides: cleanSizeGuides(input.size_guides, sizes), color_images: keptColorImages(input.color_images, colors), excludes_charms: category === 'bags' && input.excludes_charms === true, published: input.published !== false, featured: input.featured === true }; }

function inventoryKey(item) { const color = String(item?.color || '').trim(), size = String(item?.size || '').trim(); return [color && `color:${color}`, size && `size:${size}`].filter(Boolean).join('|') || 'default'; }
function cleanStock(value) { const stock = plainObject(value); return Object.fromEntries(Object.entries(stock).map(([key, count]) => [String(key).slice(0, 120), Math.max(0, Math.floor(Number(count) || 0))]).filter(([key]) => key)); }
function cleanVariantSaleTypes(value) { const types = plainObject(value); return Object.fromEntries(Object.entries(types).map(([key, type]) => [String(key).slice(0, 120), type === 'in_stock' ? 'in_stock' : 'preorder']).filter(([key]) => key)); }
function productVariantSaleType(product, item) { const sku = inventoryKey(item), color = String(item?.color || '').trim(), colorKey = color ? `color:${color}` : ''; return product?.variant_sale_types?.[sku] || (colorKey && product?.variant_sale_types?.[colorKey]) || product?.sale_type || 'preorder'; }
productInput = function productInputWithInventory(input) { const name_en = String(input.name_en || '').trim(), price = Number(input.price), category = ['clothes', 'bags', 'charms'].includes(input.category) ? input.category : 'clothes', requestedSizes = Array.isArray(input.sizes) ? input.sizes : String(input.sizes || '').split(','), requestedColors = Array.isArray(input.colors) ? input.colors : String(input.colors || '').split(','), sizes = category === 'clothes' ? requestedSizes.map(size => String(size).trim()).filter(Boolean).slice(0, 20) : [], colors = requestedColors.map(color => String(color).trim()).filter(Boolean).slice(0, 30), variant_sale_types = cleanVariantSaleTypes(input.variant_sale_types), sale_type = Object.values(variant_sale_types).includes('in_stock') || input.sale_type === 'in_stock' ? 'in_stock' : 'preorder'; if (!name_en || !Number.isFinite(price) || price < 0) throw Error('Product name and price are required.'); return { name_en, name_km: String(input.name_km || '').trim(), description_en: String(input.description_en || '').trim(), description_km: String(input.description_km || '').trim(), category, price, sizes, colors, size_guides: cleanSizeGuides(input.size_guides, sizes), color_images: keptColorImages(input.color_images, colors), sale_type, variant_sale_types, stock_by_sku: cleanStock(input.stock_by_sku), delivery_notes: cleanDeliveryNotes(input.delivery_notes), excludes_charms: input.excludes_charms === true, published: input.published !== false, featured: input.featured === true }; };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/admin/session') return sendJson(res, 200, { authenticated: admin(req) });
    if (req.method === 'POST' && url.pathname === '/api/admin/session') {
      const input = await readBody(req), suppliedKey = String(input.adminKey || '');
      if (!suppliedKey) return sendJson(res, 400, { error: 'Please enter the admin key.' });
      if (!process.env.ADMIN_KEY || !secureEqual(suppliedKey, process.env.ADMIN_KEY)) return sendJson(res, 401, { error: 'Incorrect admin key. Please try again.' });
      return sendJson(res, 200, { message: 'Access granted successfully.' }, { 'set-cookie': adminSessionCookie() });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/admin/session') return sendJson(res, 204, {}, { 'set-cookie': clearAdminSessionCookie() });
    // Payment orders are created before a QR is sent. They deliberately do not
    // deduct stock until the administrator confirms the uploaded proof.
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const input = await readBody(req), telegramUser = verifyTelegramInitData(input.telegramInitData), webOrder = !input.telegramInitData;
      if (!telegramUser && !webOrder) return sendJson(res, 401, { error: 'Telegram verification failed.' });
      if (!Array.isArray(input.items) || !input.items.length) return sendJson(res, 400, { error: 'Invalid order.' });
      const productIds = [...new Set(input.items.map(item => String(item.id || '')).filter(id => /^[\w-]+$/.test(id)))];
      const products = await db(`products?select=id,name_en,price,sale_type,variant_sale_types,stock_by_sku,published&id=in.(${productIds.join(',')})`);
      if (!products?.length || products.length !== productIds.length || products.some(product => !product.published)) return sendJson(res, 400, { error: 'A product is no longer available.' });
      const productMap = new Map(products.map(product => [product.id, product]));
      const items = input.items.map(item => {
        const product = productMap.get(String(item.id)), quantity = Math.max(1, Math.floor(Number(item.quantity) || 0)), sku = inventoryKey(item);
        if (!product || !quantity) throw Error('Invalid order item.');
        return { id: product.id, name: product.name_en, size: String(item.size || ''), color: String(item.color || ''), sku, quantity, price: Number(product.price), sale_type: productVariantSaleType(product, item) };
      });
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const settings = (await db('store_settings?select=shipping,free_shipping_threshold&id=eq.1'))?.[0] || defaults;
      const delivery = input.delivery === 'pickup' ? 'pickup' : 'delivery', region = String(input.region || '');
      const threshold = Number(settings.free_shipping_threshold), deliveryFee = Number(String(settings.shipping?.[region] || '$0').replace('$', ''));
      const shipping = delivery === 'delivery' && !(Number.isFinite(threshold) && threshold > 0 && subtotal >= threshold) ? deliveryFee : 0;
      const order = { telegram_user_id: String(telegramUser?.id || `web-${randomUUID()}`), customer_name: String(input.name || '').trim(), contact: String(input.contact || '').trim(), address: String(input.address || '').trim(), delivery, region, items, subtotal, shipping, total: subtotal + shipping };
      if (!order.customer_name || !order.contact) return sendJson(res, 400, { error: 'Customer information is required.' });
      const saved = await db('rpc/create_pending_order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order: order }) });
      if (telegramUser) await sendPaymentQr(telegramUser.id, saved).catch(error => console.error(error.message));
      return sendJson(res, 201, { order_number: saved.order_number, status: saved.status, payment_qr_url: telegramUser ? '' : (process.env.PAYMENT_QR_IMAGE_URL || '/payment-qr.png') });
    }
    if (req.method === 'POST' && /^\/api\/admin\/orders\/[\w-]+\/confirm-payment$/.test(url.pathname)) {
      if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = url.pathname.split('/')[4];
      const saved = await db('rpc/confirm_order_payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order_id: id }) });
      await notifyOrderStatus(saved).catch(error => console.error(error.message));
      return sendJson(res, 200, saved);
    }
    if (req.method === 'POST' && /^\/api\/admin\/orders\/[\w-]+\/reject-payment$/.test(url.pathname)) {
      if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = url.pathname.split('/')[4];
      const saved = await db(`orders?id=eq.${id}&status=eq.payment_proof_uploaded`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'payment_rejected' }) });
      if (!saved?.[0]) return sendJson(res, 400, { error: 'This order has no payment proof waiting for review.' });
      await notifyOrderStatus(saved[0]).catch(error => console.error(error.message));
      return sendJson(res, 200, saved[0]);
    }
    if (req.method === 'GET' && /^\/api\/admin\/orders\/[\w-]+\/payment-proof$/.test(url.pathname)) {
      if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = url.pathname.split('/')[4], rows = await db(`orders?select=payment_proof_file_id,payment_proof_mime_type&id=eq.${id}&limit=1`), proof = rows?.[0];
      if (!proof?.payment_proof_file_id) return sendJson(res, 404, { error: 'Payment proof was not found.' });
      const telegramFile = await telegramApi('getFile', { file_id: proof.payment_proof_file_id });
      const upstream = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${telegramFile.result?.file_path || ''}`);
      if (!upstream.ok) return sendJson(res, 502, { error: 'Payment proof could not be downloaded.' });
      res.writeHead(200, { 'content-type': proof.payment_proof_mime_type || upstream.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=60' });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/orders\/[\w-]+$/.test(url.pathname)) {
      if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const { status } = await readBody(req), id = url.pathname.split('/').pop();
      if (status === 'cancelled') {
        const saved = await db('rpc/cancel_order_safely', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order_id: id }) });
        await notifyOrderStatus(saved).catch(error => console.error(error.message));
        return sendJson(res, 200, saved);
      }
      if (!['processing', 'shipping', 'ready_for_pickup', 'completed'].includes(status)) return sendJson(res, 400, { error: 'Use Confirm payment to mark an order as paid.' });
      const saved = await db(`orders?id=eq.${id}&status=in.(paid,processing,shipping,ready_for_pickup)`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status }) });
      if (!saved?.[0]) return sendJson(res, 400, { error: 'This order must be payment-confirmed before fulfilment.' });
      await notifyOrderStatus(saved[0]).catch(error => console.error(error.message));
      return sendJson(res, 200, saved[0]);
    }
    if (req.method === 'DELETE' && /^\/api\/admin\/orders\/[\w-]+$/.test(url.pathname)) {
      if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = url.pathname.split('/').pop();
      // Cancel first so a payment-confirmed in-stock order returns its stock and
      // its sales data no longer appears before the record is permanently removed.
      await db('rpc/cancel_order_safely', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order_id: id }) });
      await db(`orders?id=eq.${id}`, { method: 'DELETE' });
      return sendJson(res, 204, {});
    }
    if (req.method === 'GET' && url.pathname === '/api/store') { const [settings, products] = await Promise.all([db('store_settings?select=*&id=eq.1'), db('products?select=*&published=eq.true&order=created_at.desc')]); return sendJson(res, 200, { settings: settings?.[0] || defaults, products: products || [] }); }
    if (req.method === 'GET' && url.pathname === '/api/admin/store') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const [settings, products, orders] = await Promise.all([db('store_settings?select=*&id=eq.1'), db('products?select=*&order=created_at.desc'), db('orders?select=*&order=created_at.desc&limit=500')]); return sendJson(res, 200, { settings: settings?.[0] || defaults, products: products || [], orders: orders || [] }); }
    if (req.method === 'PUT' && url.pathname === '/api/admin/settings') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req); const free_shipping_threshold = Number(input.free_shipping_threshold); const settings = { id: 1, ...defaults, ...input, pickup: String(input.pickup || '').trim(), shipping: input.shipping || defaults.shipping, default_delivery_notes: cleanDeliveryNotes(input.default_delivery_notes || defaults.default_delivery_notes), free_shipping_threshold: Number.isFinite(free_shipping_threshold) && free_shipping_threshold >= 0 ? free_shipping_threshold : defaults.free_shipping_threshold }; if (!settings.pickup) return sendJson(res, 400, { error: 'Pickup address is required.' }); await db('store_settings?id=eq.1', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(settings) }); return sendJson(res, 200, settings); }
    if (req.method === 'POST' && url.pathname === '/api/admin/telegram-owner') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), user = verifyTelegramInitData(input.telegramInitData); if (!user?.id) return sendJson(res, 400, { error: 'Open Admin from the Telegram Mini App before connecting this account.' }); await db('store_settings?id=eq.1', { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ owner_telegram_chat_id: String(user.id) }) }); await ensureTelegramWebhook().catch(error => console.error(error.message)); return sendJson(res, 200, { message: 'This Telegram account will receive payment screenshots.' }); }
    if (req.method === 'PATCH' && /^\/api\/admin\/inventory\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), stock_by_sku = cleanStock(input.stock_by_sku), id = url.pathname.split('/').pop(); const saved = await db(`products?id=eq.${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ stock_by_sku }) }); if (!saved?.[0]) return sendJson(res, 404, { error: 'Product was not found.' }); return sendJson(res, 200, saved[0]); }
    if (req.method === 'PATCH' && /^\/api\/admin\/products\/[\w-]+\/publish$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const { published } = await readBody(req), id = url.pathname.split('/')[4]; const saved = await db(`products?id=eq.${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ published: published === true }) }); const product = saved?.[0]; if (product?.published) await publishProductToChannel(product).catch(error => console.error(`Channel product post failed: ${error.message}`)); return sendJson(res, 200, product); }
    if (req.method === 'POST' && url.pathname === '/api/orders') { const input = await readBody(req), telegramUser = verifyTelegramInitData(input.telegramInitData), webOrder = !input.telegramInitData; if (!telegramUser && !webOrder) return sendJson(res, 401, { error: 'Telegram verification failed.' }); if (!Array.isArray(input.items) || !input.items.length) return sendJson(res, 400, { error: 'Invalid order.' }); const productIds = [...new Set(input.items.map(item => String(item.id || '')).filter(id => /^[\w-]+$/.test(id)))]; const products = await db(`products?select=id,name_en,price,sale_type,variant_sale_types,stock_by_sku&id=in.(${productIds.join(',')})`); if (!products?.length || products.length !== productIds.length) return sendJson(res, 400, { error: 'A product is no longer available.' }); const productMap = new Map(products.map(product => [product.id, product])); const items = input.items.map(item => { const product = productMap.get(String(item.id)), quantity = Math.max(1, Math.floor(Number(item.quantity) || 0)), sku = inventoryKey(item); if (!product || !quantity) throw Error('Invalid order item.'); return { id: product.id, name: product.name_en, size: String(item.size || ''), color: String(item.color || ''), sku, quantity, price: Number(product.price), sale_type: productVariantSaleType(product, item) }; }); const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0); const settings = (await db('store_settings?select=shipping,free_shipping_threshold&id=eq.1'))?.[0] || defaults, delivery = input.delivery === 'pickup' ? 'pickup' : 'delivery', region = String(input.region || ''), threshold = Number(settings.free_shipping_threshold), deliveryFee = Number(String(settings.shipping?.[region] || '$0').replace('$', '')), shipping = delivery === 'delivery' && !(Number.isFinite(threshold) && threshold > 0 && subtotal >= threshold) ? deliveryFee : 0; const order = { order_number: `CYP-${randomUUID().slice(0, 8).toUpperCase()}`, telegram_user_id: String(telegramUser?.id || `web-${randomUUID()}`), customer_name: String(input.name || '').trim(), contact: String(input.contact || '').trim(), address: String(input.address || '').trim(), delivery, region, items, subtotal, shipping, total: subtotal + shipping, status: 'awaiting_payment' }; if (!order.customer_name || !order.contact) return sendJson(res, 400, { error: 'Customer information is required.' }); const saved = await db('rpc/create_order_with_inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order: order }) }); if (telegramUser) await sendPaymentQr(telegramUser.id, saved).catch(error => console.error(error.message)); return sendJson(res, 201, { order_number: saved.order_number, payment_qr_url: telegramUser ? '' : (process.env.PAYMENT_QR_IMAGE_URL || '/payment-qr.png') }); }
    if (req.method === 'POST' && url.pathname === '/api/admin/products') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), item = productInput(input); item.image_url = input.mainImageData ? await uploadProductImage(input.mainImageData) : String(input.image_url || ''); item.detail_image_url = input.detailImageData ? await uploadProductImage(input.detailImageData) : String(input.detail_image_url || ''); item.color_images = await productColorImages(input.colorImageData, item.colors, item.color_images); item.image_urls = item.image_url ? [item.image_url] : []; if (!item.image_url || !item.detail_image_url) return sendJson(res, 400, { error: 'Main photo and detail photo are required.' }); const saved = await db('products', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(item) }); const product = saved?.[0]; await publishProductToChannel(product).catch(error => console.error(`Channel product post failed: ${error.message}`)); return sendJson(res, 201, product); }
    if (req.method === 'PATCH' && /^\/api\/admin\/products\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), item = productInput(input); item.image_url = input.mainImageData ? await uploadProductImage(input.mainImageData) : String(input.image_url || ''); item.detail_image_url = input.detailImageData ? await uploadProductImage(input.detailImageData) : String(input.detail_image_url || ''); item.color_images = await productColorImages(input.colorImageData, item.colors, item.color_images); item.image_urls = item.image_url ? [item.image_url] : []; if (!item.image_url) return sendJson(res, 400, { error: 'Main photo is required.' }); const saved = await db(`products?id=eq.${url.pathname.split('/').pop()}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(item) }); return sendJson(res, 200, saved?.[0]); }
    if (req.method === 'DELETE' && /^\/api\/admin\/products\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); await db(`products?id=eq.${url.pathname.split('/').pop()}`, { method: 'DELETE' }); return sendJson(res, 204, {}); }
    if (req.method === 'PATCH' && /^\/api\/admin\/orders\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const { status } = await readBody(req), id = url.pathname.split('/').pop(), allowed = ['awaiting_payment', 'paid', 'shipping', 'ready_for_pickup', 'completed', 'cancelled']; if (!allowed.includes(status)) return sendJson(res, 400, { error: 'Invalid order status.' }); const saved = status === 'cancelled' ? await db('rpc/cancel_order_with_inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_order_id: id }) }) : await db(`orders?id=eq.${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status }) }); const order = Array.isArray(saved) ? saved[0] : saved; await notifyOrderStatus(order).catch(error => console.error(error.message)); return sendJson(res, 200, order); }
    if (req.method === 'DELETE' && /^\/api\/admin\/orders\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); await db(`orders?id=eq.${url.pathname.split('/').pop()}`, { method: 'DELETE' }); return sendJson(res, 204, {}); }
    if (req.method === 'POST' && url.pathname === '/api/orders') { const input = await readBody(req), telegramUser = verifyTelegramInitData(input.telegramInitData), webOrder = !input.telegramInitData; if (!telegramUser && !webOrder) return sendJson(res, 401, { error: 'Telegram verification failed.' }); if (!Array.isArray(input.items) || !input.items.length) return sendJson(res, 400, { error: 'Invalid order.' }); const subtotal = input.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0); if (!Number.isFinite(subtotal) || subtotal < 0) return sendJson(res, 400, { error: 'Invalid order total.' }); const settings = (await db('store_settings?select=shipping,free_shipping_threshold&id=eq.1'))?.[0] || defaults, delivery = input.delivery === 'pickup' ? 'pickup' : 'delivery', region = String(input.region || ''), threshold = Number(settings.free_shipping_threshold), deliveryFee = Number(String(settings.shipping?.[region] || '$0').replace('$', '')), shipping = delivery === 'delivery' && !(Number.isFinite(threshold) && threshold > 0 && subtotal >= threshold) ? deliveryFee : 0; const order = { order_number: `CYP-${randomUUID().slice(0, 8).toUpperCase()}`, telegram_user_id: String(telegramUser?.id || `web-${randomUUID()}`), customer_name: String(input.name || '').trim(), contact: String(input.contact || '').trim(), address: String(input.address || '').trim(), delivery, region, items: input.items, subtotal, shipping, total: subtotal + shipping, status: 'awaiting_payment' }; if (!order.customer_name || !order.contact) return sendJson(res, 400, { error: 'Customer information is required.' }); if (telegramUser) await sendPaymentQr(telegramUser.id, order); await db('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order) }); return sendJson(res, 201, { order_number: order.order_number, payment_qr_url: telegramUser ? '' : (process.env.PAYMENT_QR_IMAGE_URL || '/payment-qr.png') }); }
    if (req.method === 'POST' && url.pathname === '/api/my-orders') { const input = await readBody(req), user = verifyTelegramInitData(input.telegramInitData); if (!user?.id) return sendJson(res, 401, { error: 'Open the store inside Telegram to view your orders.' }); const orders = await db(`orders?select=*&telegram_user_id=eq.${encodeURIComponent(String(user.id))}&order=created_at.desc&limit=100`); return sendJson(res, 200, { orders: orders || [] }); }
    if (req.method === 'POST' && url.pathname === '/api/my-orders/delete') { const input = await readBody(req), user = verifyTelegramInitData(input.telegramInitData), id = String(input.id || ''); if (!user?.id) return sendJson(res, 401, { error: 'Open the store inside Telegram to delete an order.' }); if (!/^[\w-]+$/.test(id)) return sendJson(res, 400, { error: 'Invalid order.' }); await db(`orders?id=eq.${id}&telegram_user_id=eq.${encodeURIComponent(String(user.id))}`, { method: 'DELETE' }); return sendJson(res, 204, {}); }
    if (req.method === 'POST' && url.pathname === '/api/telegram/webhook') { const expected = telegramWebhookSecret(); if (expected && req.headers['x-telegram-bot-api-secret-token'] !== expected) return sendJson(res, 401, { error: 'Unauthorized' }); const update = await readBody(req), message = update.message; const hasImage = Boolean(message?.photo?.length || String(message?.document?.mime_type || '').startsWith('image/')); if (hasImage) await forwardPaymentProof(message); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'GET') { const requested = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([.][.][/\\])+/, ''); const file = join(root, requested); if (!file.startsWith(root) || !existsSync(file)) return sendJson(res, 404, { error: 'Not found' }); const ext = file.split('.').pop(); const type = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png' }[ext] || 'application/octet-stream'; res.writeHead(200, { 'content-type': type }); return res.end(readFileSync(file)); }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) { sendJson(res, 500, { error: error.message || 'Unexpected error.' }); }
});
server.listen(process.env.PORT || 3000, () => console.log(`Cypress store running on http://localhost:${process.env.PORT || 3000}`));
