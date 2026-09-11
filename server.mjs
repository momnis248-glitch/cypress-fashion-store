import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = process.cwd();
const defaults = {
  pickup: 'TG Factory #4', shipping: { 'Phnom Penh': '$2.00', 'Other provinces': '$3.50', 'Remote areas': '$5.00' },
  hero_en: 'A little light, for every day.', hero_km: 'សម្រស់តិចៗ សម្រាប់រាល់ថ្ងៃ។',
  hero_text_en: 'Curated clothing and bags. Prices are in USD. Delivery or pickup available.',
  hero_text_km: 'សម្លៀកបំពាក់ និងកាបូបដែលបានជ្រើសរើស។ តម្លៃគិតជា USD។ មានដឹកជញ្ជូន ឬមកយកផ្ទាល់។'
};
const sendJson = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 7_000_000) reject(Error('Request too large')); }); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(Error('Invalid JSON')); } }); });
const admin = req => Boolean(process.env.ADMIN_KEY) && req.headers['x-admin-key'] === process.env.ADMIN_KEY;
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
async function sendPaymentQr(chatId, order) {
  if (!process.env.BOT_TOKEN) throw Error('BOT_TOKEN is not configured.');
  const photo = process.env.PAYMENT_QR_FILE_ID || process.env.PAYMENT_QR_IMAGE_URL || `${process.env.RENDER_EXTERNAL_URL}/payment-qr.png`;
  const caption = ['Payment QR / QR កូដបង់ប្រាក់', '', `Order: ${order.order_number}`, `Total: $${Number(order.total).toFixed(2)}`, order.delivery === 'pickup' ? 'Pickup / មកយកផ្ទាល់' : 'Delivery / ដឹកជញ្ជូន', '', 'Please pay the exact amount, then send your payment proof in this chat.', 'សូមបង់ចំនួនទឹកប្រាក់ឲ្យត្រឹមត្រូវ ហើយផ្ញើភស្តុតាងការបង់ប្រាក់ក្នុងការជជែកនេះ។'].join('\n');
  const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo, caption }) });
  if (!response.ok) throw Error('Telegram could not send the payment QR.');
}
async function uploadProductImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ''); if (!match) throw Error('Use a PNG, JPG, or WebP image.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]]; const name = `${randomUUID()}.${extension}`;
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/products/${name}`, { method: 'PUT', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': match[1], 'x-upsert': 'false' }, body: Buffer.from(match[2], 'base64') });
  if (!response.ok) throw Error('Image upload failed.'); return `${process.env.SUPABASE_URL}/storage/v1/object/public/products/${name}`;
}
function productInput(input) { const name_en = String(input.name_en || '').trim(), price = Number(input.price); if (!name_en || !Number.isFinite(price) || price < 0) throw Error('Product name and price are required.'); return { name_en, name_km: String(input.name_km || '').trim(), description_en: String(input.description_en || '').trim(), description_km: String(input.description_km || '').trim(), category: input.category === 'bags' ? 'bags' : 'clothes', price, published: input.published !== false, featured: input.featured === true }; }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/store') { const [settings, products] = await Promise.all([db('store_settings?select=*&id=eq.1'), db('products?select=*&published=eq.true&order=created_at.desc')]); return sendJson(res, 200, { settings: settings?.[0] || defaults, products: products || [] }); }
    if (req.method === 'GET' && url.pathname === '/api/admin/store') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const [settings, products, orders] = await Promise.all([db('store_settings?select=*&id=eq.1'), db('products?select=*&order=created_at.desc'), db('orders?select=*&order=created_at.desc&limit=100')]); return sendJson(res, 200, { settings: settings?.[0] || defaults, products: products || [], orders: orders || [] }); }
    if (req.method === 'PUT' && url.pathname === '/api/admin/settings') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req); const settings = { id: 1, ...defaults, ...input, pickup: String(input.pickup || '').trim(), shipping: input.shipping || defaults.shipping }; if (!settings.pickup) return sendJson(res, 400, { error: 'Pickup address is required.' }); await db('store_settings?id=eq.1', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(settings) }); return sendJson(res, 200, settings); }
    if (req.method === 'POST' && url.pathname === '/api/admin/products') { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), item = productInput(input); item.image_url = input.imageData ? await uploadProductImage(input.imageData) : String(input.image_url || ''); if (!item.image_url) return sendJson(res, 400, { error: 'Product image is required.' }); const saved = await db('products', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(item) }); return sendJson(res, 201, saved?.[0]); }
    if (req.method === 'PATCH' && /^\/api\/admin\/products\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const input = await readBody(req), item = productInput(input); item.image_url = input.imageData ? await uploadProductImage(input.imageData) : String(input.image_url || ''); const saved = await db(`products?id=eq.${url.pathname.split('/').pop()}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(item) }); return sendJson(res, 200, saved?.[0]); }
    if (req.method === 'DELETE' && /^\/api\/admin\/products\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); await db(`products?id=eq.${url.pathname.split('/').pop()}`, { method: 'DELETE' }); return sendJson(res, 204, {}); }
    if (req.method === 'PATCH' && /^\/api\/admin\/orders\/[\w-]+$/.test(url.pathname)) { if (!admin(req)) return sendJson(res, 401, { error: 'Unauthorized' }); const { status } = await readBody(req); const allowed = ['awaiting_payment', 'paid', 'shipping', 'ready_for_pickup', 'completed', 'cancelled']; if (!allowed.includes(status)) return sendJson(res, 400, { error: 'Invalid order status.' }); const saved = await db(`orders?id=eq.${url.pathname.split('/').pop()}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status }) }); return sendJson(res, 200, saved?.[0]); }
    if (req.method === 'POST' && url.pathname === '/api/orders') { const input = await readBody(req), user = verifyTelegramInitData(input.telegramInitData); if (!user) return sendJson(res, 401, { error: 'Open checkout from the Telegram Mini App.' }); if (!Array.isArray(input.items) || !input.items.length || !Number.isFinite(input.total)) return sendJson(res, 400, { error: 'Invalid order.' }); const order = { order_number: `CYP-${randomUUID().slice(0, 8).toUpperCase()}`, telegram_user_id: String(user.id), customer_name: String(input.name || '').trim(), contact: String(input.contact || '').trim(), address: String(input.address || '').trim(), delivery: input.delivery === 'pickup' ? 'pickup' : 'delivery', region: String(input.region || ''), items: input.items, subtotal: Number(input.subtotal), shipping: Number(input.shipping), total: Number(input.total), status: 'awaiting_payment' }; if (!order.customer_name || !order.contact) return sendJson(res, 400, { error: 'Customer information is required.' }); await db('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(order) }); await sendPaymentQr(user.id, order); return sendJson(res, 201, { order_number: order.order_number }); }
    if (req.method === 'GET') { const requested = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([.][.][/\\])+/, ''); const file = join(root, requested); if (!file.startsWith(root) || !existsSync(file)) return sendJson(res, 404, { error: 'Not found' }); const ext = file.split('.').pop(); const type = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png' }[ext] || 'application/octet-stream'; res.writeHead(200, { 'content-type': type }); return res.end(readFileSync(file)); }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) { sendJson(res, 500, { error: error.message || 'Unexpected error.' }); }
});
server.listen(process.env.PORT || 3000, () => console.log(`Cypress store running on http://localhost:${process.env.PORT || 3000}`));
