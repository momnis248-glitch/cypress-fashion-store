// Product media, carousel and purchase-sheet layer. Loaded last so it can
// extend the historical storefront without resetting its route memory.
(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const syncTelegramSafeInset = () => {
    const webApp = window.Telegram?.WebApp;
    const top = Number(webApp?.contentSafeAreaInset?.top ?? webApp?.safeAreaInset?.top ?? 0);
    document.documentElement.style.setProperty('--telegram-top-inset', `${Math.max(0, top)}px`);
  };
  syncTelegramSafeInset();
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', syncTelegramSafeInset);
  window.Telegram?.WebApp?.onEvent?.('safeAreaChanged', syncTelegramSafeInset);
  const product = id => state.products.find(item => item.id === id);
  const gallery = item => {
    const urls = [item.image_url, ...(Array.isArray(item.image_urls) ? item.image_urls : [])].filter(Boolean);
    return [...new Set(urls)].slice(0, 8);
  };
  const detailImages = item => Array.isArray(item?.detail_image_urls) ? item.detail_image_urls.filter(Boolean).slice(0, 20) : [];
  const itemCount = () => state.cart.reduce((count, item) => count + Number(item.qty || 0), 0);
  const languageIsKhmer = () => state.language === 'km';
  const typeLabel = (type) => languageIsKhmer() ? (type === 'in_stock' ? 'មានស្តុក' : 'បញ្ជាទិញមុន') : (type === 'in_stock' ? 'IN STOCK' : 'PRE-ORDER');
  const deliveryText = item => {
    const language = languageIsKhmer() ? 'km' : 'en';
    const fallback = language === 'km'
      ? 'ទំនិញបញ្ជាទិញមុន (Pre-order): ទទួលបានទំនិញក្នុងរយៈពេល 15–18 ថ្ងៃ បន្ទាប់ពីធ្វើការបញ្ជាទិញ។\nទំនិញមានស្តុក – ដឹកជញ្ជូន: ទទួលបានទំនិញក្នុងរយៈពេល 3–4 ថ្ងៃ។\nមកយកដោយខ្លួនឯង: អាចមកយកបានបន្ទាប់ពីចេញពីធ្វើការនៅថ្ងៃបន្ទាប់។\nទីតាំងមកយក: National Road No. 4, KM 82, T20 Factory Security Room'
      : 'Pre-order: Delivery in 15–18 days after placing the order.\nIn Stock – Delivery: Delivery in 3–4 days.\nSelf-Pickup: Available after work the next day.\nPickup Location: National Road No. 4, KM 82, T20 Factory Security Room';
    const raw = String(item.delivery_notes?.[language] || state.settings.default_delivery_notes?.[language] || fallback).trim();
    return esc(raw).replace(/^(Pre-order:|In Stock – Delivery:|Self-Pickup:|Pickup Location:)/gm, '<strong>$1</strong>').replace(/\n/g, '<br>');
  };
  const mediaItems = item => {
    const images = gallery(item);
    if (!images.length) return [];
    return [{ kind: 'image', url: images[0] }, ...(item.video_url ? [{ kind: 'video', url: item.video_url }] : []), ...images.slice(1).map(url => ({ kind: 'image', url }))];
  };
  const preloadNeighbour = (item, current) => {
    const next = mediaItems(item)[(current + 1) % mediaItems(item).length];
    if (next?.kind === 'image') { const image = new Image(); image.src = next.url; }
  };
  const activateCarouselMedia = item => {
    const media = mediaItems(item), current = state.productCarouselIndex?.[item.id] || 0;
    preloadNeighbour(item, current);
    const video = document.querySelector('#product-media-carousel video');
    if (video) { video.muted = true; video.play().catch(() => {}); }
  };
  const carouselHtml = (item, direction = '') => {
    const media = mediaItems(item), indexMap = state.productCarouselIndex || (state.productCarouselIndex = {}), current = Math.min(indexMap[item.id] || 0, Math.max(0, media.length - 1)), active = media[current];
    if (!active) return '<div class="product-carousel empty-media">No product image</div>';
    const asset = active.kind === 'video'
      ? `<video controls playsinline preload="metadata" muted loop src="${esc(active.url)}"></video><span class="video-chip">▶ Video</span>`
      : `<img src="${esc(active.url)}" alt="${esc(productName(item))}" loading="eager">`;
    return `<div id="product-media-carousel" class="product-carousel ${direction ? `carousel-swipe-${direction}` : ''}" ontouchstart="productDetailTouchStart(event,'${item.id}')" ontouchmove="productDetailTouchMove(event,'${item.id}')" ontouchend="productDetailTouchEnd(event,'${item.id}')" ontouchcancel="productDetailTouchEnd(event,'${item.id}')"><button class="carousel-back" aria-label="Back" onclick="window.returnFromProduct?.()">←</button>${asset}${media.length > 1 ? `<button class="carousel-arrow previous" aria-label="Previous" onclick="moveCarousel('${item.id}',-1)">‹</button><button class="carousel-arrow next" aria-label="Next" onclick="moveCarousel('${item.id}',1)">›</button><span class="carousel-count">${current + 1}/${media.length}</span>` : ''}</div>`;
  };
  window.moveCarousel = (id, direction) => {
    const item = product(id); if (!item) return;
    document.querySelectorAll('#product-media-carousel video').forEach(video => video.pause());
    const media = mediaItems(item), map = state.productCarouselIndex || (state.productCarouselIndex = {});
    map[id] = (Math.max(0, map[id] || 0) + direction + media.length) % media.length;
    const target = document.querySelector('#product-media-carousel');
    if (target) { target.outerHTML = carouselHtml(item, direction > 0 ? 'next' : 'previous'); activateCarouselMedia(item); }
  };
  let detailTouch = null;
  const edgeWidth = () => Math.min(32, Math.max(22, Math.round(window.innerWidth * .075)));
  const detailPage = () => document.querySelector('.product-detail-media');
  const returnUnderlay = () => document.querySelector('.product-return-underlay');
  const resetDetailDrag = () => {
    const page = detailPage();
    if (!page) return;
    page.classList.remove('edge-back-dragging', 'edge-back-leaving');
    page.style.removeProperty('--edge-back-x');
    page.style.removeProperty('--edge-back-progress');
    const underlay = returnUnderlay(); if (underlay) underlay.style.opacity = '0';
  };
  window.productDetailTouchStart = (event, id) => {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch) return;
    detailTouch = { id, startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, at: performance.now(), edge: touch.clientX <= edgeWidth(), dragging: false };
  };
  window.productDetailTouchMove = event => {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!detailTouch || !touch) return;
    detailTouch.lastX = touch.clientX; detailTouch.lastY = touch.clientY;
    const dx = touch.clientX - detailTouch.startX, dy = touch.clientY - detailTouch.startY;
    if (!detailTouch.edge || dx <= 0 || Math.abs(dy) > Math.abs(dx)) return;
    detailTouch.dragging = true;
    const page = detailPage();
    if (!page) return;
    const progress = Math.min(.92, dx / Math.max(1, window.innerWidth));
    page.classList.add('edge-back-dragging');
    page.style.setProperty('--edge-back-x', `${Math.min(dx, window.innerWidth)}px`);
    page.style.setProperty('--edge-back-progress', String(progress));
    const underlay = returnUnderlay(); if (underlay) underlay.style.opacity = String(Math.min(.96, progress * 1.45));
  };
  window.productDetailTouchEnd = (event, id) => {
    const touch = event.changedTouches?.[0];
    if (!detailTouch || !touch) { detailTouch = null; return; }
    const dx = touch.clientX - detailTouch.startX, dy = touch.clientY - detailTouch.startY;
    const elapsed = Math.max(1, performance.now() - detailTouch.at);
    const shouldReturn = detailTouch.edge && detailTouch.dragging && dx > 0 && Math.abs(dx) > Math.abs(dy) && (dx > window.innerWidth * .28 || dx / elapsed > .62);
    detailTouch = null;
    if (shouldReturn) {
      const page = detailPage();
      if (page) { page.classList.remove('edge-back-dragging'); page.classList.add('edge-back-leaving'); page.style.setProperty('--edge-back-x', `${window.innerWidth}px`); page.style.setProperty('--edge-back-progress', '1'); }
      const underlay = returnUnderlay(); if (underlay) underlay.style.opacity = '1';
      window.setTimeout(() => window.returnFromProduct?.(), 180);
      return;
    }
    resetDetailDrag();
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) window.moveCarousel(id, dx < 0 ? 1 : -1);
  };

  const optionType = (item, size, color) => variantType(item, size, color);
  const optionStock = (item, size, color) => variantStock(item, size, color);
  const priceNumber = value => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; };
  const preorderPrice = item => priceNumber(item?.preorder_price) ?? priceNumber(item?.price) ?? 0;
  const instockPrice = item => priceNumber(item?.instock_price) ?? preorderPrice(item) + 3;
  const stockForChoice = (item, size, color) => {
    const key = stockKey(size, color), stock = item?.stock_by_sku || {};
    if (Object.prototype.hasOwnProperty.call(stock, key)) return Math.max(0, Number(stock[key]) || 0);
    if (Object.prototype.hasOwnProperty.call(stock, 'default')) return Math.max(0, Number(stock.default) || 0);
    return Math.max(0, Number(item?.instock_quantity) || 0);
  };
  const comboAvailable = (item, size, color, saleType = optionType(item, size, color)) => saleType !== 'in_stock' || stockForChoice(item, size, color) > 0;
  const optionSheet = item => {
    const draft = state.productOptionDraft || {}, sizes = item.category === 'clothes' ? (item.sizes || []) : [], colors = item.colors || [];
    const selectedSize = draft.size || '', selectedColor = draft.color || '', selectedType = draft.sale_type || 'preorder', max = selectedType === 'in_stock' ? stockForChoice(item, selectedSize, selectedColor) : 99;
    const colorButtons = colors.length ? `<div class="option-group"><b>${languageIsKhmer() ? 'ពណ៌' : 'Color'}</b><div class="option-buttons">${colors.map(color => { const enabled = !sizes.length ? comboAvailable(item, '', color) : (!selectedSize || comboAvailable(item, selectedSize, color)); const photo = item.color_images?.[color]; return `<button type="button" class="option-button ${selectedColor === color ? 'selected' : ''}" ${enabled ? '' : 'disabled'} onclick="setProductOption('color','${esc(color)}')">${photo ? `<img src="${esc(photo)}" alt="">` : ''}${esc(colorName ? colorName(color) : color)}</button>`; }).join('')}</div></div>` : '';
    const sizeButtons = sizes.length ? `<div class="option-group"><b>${languageIsKhmer() ? 'ទំហំ' : 'Size'}</b><div class="option-buttons">${sizes.map(size => { const enabled = !colors.length ? comboAvailable(item, size, '') : (!selectedColor || comboAvailable(item, size, selectedColor)); return `<button type="button" class="option-button ${selectedSize === size ? 'selected' : ''}" ${enabled ? '' : 'disabled'} onclick="setProductOption('size','${esc(size)}')">${esc(size)}</button>`; }).join('')}</div></div>` : '';
    const guide = item.size_guides?.[selectedSize] || {};
    const sizeGuide = selectedSize && (guide.waist || guide.length || guide.recommendation) ? `<div class="selected-size-guide"><b>${languageIsKhmer() ? `${selectedSize} ទំហំ` : `${selectedSize} size details`}</b><div>${guide.waist ? `<span>${languageIsKhmer() ? 'ចង្កេះ' : 'Waist'}: <strong>${esc(guide.waist)}</strong></span>` : ''}${guide.length ? `<span>${languageIsKhmer() ? 'ប្រវែងខោ' : 'Length'}: <strong>${esc(guide.length)}</strong></span>` : ''}${guide.recommendation ? `<span>${languageIsKhmer() ? 'ណែនាំ' : 'Recommended'}: <strong>${esc(guide.recommendation)}</strong></span>` : ''}</div></div>` : '';
    const typeChoices = `<div class="option-group price-type-options"><b>${languageIsKhmer() ? 'ប្រភេទការទិញ' : 'Purchase option'}</b><div class="option-buttons"><button type="button" class="option-button ${selectedType === 'preorder' ? 'selected' : ''}" onclick="setProductOption('sale_type','preorder')"><span>${typeLabel('preorder')}</span><strong>${money(preorderPrice(item))}</strong><small>15–18 days</small></button><button type="button" class="option-button ${selectedType === 'in_stock' ? 'selected' : ''}" ${stockForChoice(item, selectedSize, selectedColor) > 0 ? '' : 'disabled'} onclick="setProductOption('sale_type','in_stock')"><span>${typeLabel('in_stock')}</span><strong>${money(instockPrice(item))}</strong><small>${stockForChoice(item, selectedSize, selectedColor) > 0 ? '3–4 days' : 'Sold Out'}</small></button></div></div>`;
    return `<div class="option-overlay" onclick="closeProductOptions(event)"><section class="option-sheet" onclick="event.stopPropagation()"><div class="sheet-title"><b>${languageIsKhmer() ? 'ជ្រើសរើសលក្ខណៈ' : 'Choose options'}</b><button type="button" class="sheet-close" onclick="closeProductOptions()">×</button></div><div class="sheet-product"><img src="${esc((item.color_images?.[selectedColor]) || item.image_url)}"><span>${esc(productName(item))}<strong>${money(selectedType === 'in_stock' ? instockPrice(item) : preorderPrice(item))}</strong></span></div>${typeChoices}${colorButtons}${sizeButtons}${sizeGuide}<div class="option-group quantity-picker"><b>${languageIsKhmer() ? 'ចំនួន' : 'Quantity'}</b><div><button type="button" onclick="adjustProductQuantity(-1)">−</button><span>${Math.max(1, Number(draft.qty || 1))}</span><button type="button" ${max <= Number(draft.qty || 1) ? 'disabled' : ''} onclick="adjustProductQuantity(1)">+</button></div></div>${selectedType === 'in_stock' ? `<small class="stock-tip">${max} ${languageIsKhmer() ? 'នៅសល់' : 'in stock'}</small>` : ''}<button type="button" class="primary sheet-confirm" onclick="confirmProductOptions()">${draft.mode === 'buy' ? (languageIsKhmer() ? 'បន្តការទូទាត់' : 'Confirm') : (languageIsKhmer() ? 'បន្ថែមទៅកន្ត្រក' : 'Add to Cart')}</button></section></div>`;
  };
  const refreshOptionSheet = () => { const item = product(state.productOptionDraft?.id); const overlay = document.querySelector('.option-overlay'); if (item && overlay) overlay.outerHTML = optionSheet(item); };
  window.openProductOptions = (id, mode) => { const item = product(id); if (!item) return; state.productOptionDraft = { id, mode, size: '', color: '', sale_type: 'preorder', qty: 1 }; document.body.insertAdjacentHTML('beforeend', optionSheet(item)); };
  window.closeProductOptions = event => { if (event && event.target !== event.currentTarget) return; document.querySelector('.option-overlay')?.remove(); state.productOptionDraft = null; };
  window.setProductOption = (key, value) => { const draft = state.productOptionDraft; if (!draft) return; draft[key] = value; const item = product(draft.id); if (item && draft.sale_type === 'in_stock') draft.qty = Math.min(draft.qty, Math.max(1, stockForChoice(item, draft.size, draft.color))); refreshOptionSheet(); };
  window.adjustProductQuantity = delta => { const draft = state.productOptionDraft, item = product(draft?.id); if (!draft || !item) return; const max = draft.sale_type === 'in_stock' ? stockForChoice(item, draft.size, draft.color) : 99; draft.qty = Math.max(1, Math.min(max || 1, Number(draft.qty || 1) + delta)); refreshOptionSheet(); };
  window.confirmProductOptions = () => {
    const draft = state.productOptionDraft, item = product(draft?.id); if (!draft || !item) return;
    if ((item.colors?.length && !draft.color) || (item.category === 'clothes' && item.sizes?.length && !draft.size)) { alert('Please select all options.'); return; }
    if (!comboAvailable(item, draft.size, draft.color, draft.sale_type)) { alert('This option is sold out.'); return; }
    const chosen = { id: item.id, size: draft.size, color: draft.color, sale_type: draft.sale_type, qty: Number(draft.qty || 1) };
    document.querySelector('.option-overlay')?.remove();
    if (draft.mode === 'buy') { state.buyNowItem = chosen; state.productOptionDraft = null; showCart(); return; }
    const existing = state.cart.find(row => row.id === chosen.id && row.size === chosen.size && row.color === chosen.color && (row.sale_type || 'preorder') === chosen.sale_type);
    const maximum = chosen.sale_type === 'in_stock' ? stockForChoice(item, chosen.size, chosen.color) : 99;
    if (existing) existing.qty = Math.min(maximum, existing.qty + chosen.qty); else state.cart.push(chosen);
    state.productOptionDraft = null; save(); render(); alert(languageIsKhmer() ? 'បានបន្ថែមទៅកន្ត្រក ✓' : 'Added to cart ✓');
  };

  const mediaProductDetail = () => {
    const item = product(state.productId);
    if (!item && state.deepLinkEntry && state.deepLinkPending) return `<section class="panel unavailable-product"><p>Loading product…</p></section>`;
    if (!item) return `<section class="panel"><p>This product is currently unavailable.</p><button class="back home-return" onclick="showShop()">Continue Shopping</button></section>`;
    const brief = languageIsKhmer() ? item.description_km : item.description_en;
    const longDetail = detailImages(item).length ? `<section class="product-long-details" aria-label="Product details">${detailImages(item).map((url, index) => `<img src="${esc(url)}" alt="${esc(productName(item))} detail ${index + 1}" loading="lazy">`).join('')}</section>` : '';
    const preview=`<div class="product-return-underlay" aria-hidden="true"><div><b>CYPRESS<br>Fashion Store</b><span>${languageIsKhmer() ? 'ផលិតផលពិសេស' : 'Featured'}</span><i></i><i></i><i></i></div></div>`;
    const available = stockForChoice(item, '', '') > 0;
    return `<section class="product-detail product-detail-media">${carouselHtml(item)}<div class="detail-media-info"><h2>${esc(productName(item))}</h2>${brief ? `<p class="product-brief">${esc(brief)}</p>` : ''}<div class="customer-price-options"><div><span class="sale-badge preorder">${typeLabel('preorder')}</span><strong>${money(preorderPrice(item))}</strong><small>Delivery in 15–18 days</small></div><div class="${available ? '' : 'sold-out-choice'}"><span class="sale-badge instock">${typeLabel('in_stock')}</span><strong>${money(instockPrice(item))}</strong><small>${available ? 'Delivery in 3–4 days' : 'Sold Out'}</small></div></div><div class="delivery-mini"><b>${languageIsKhmer() ? 'ការដឹកជញ្ជូន' : 'Delivery Information'}</b><span>${deliveryText(item)}</span></div>${item.category === 'bags' && item.excludes_charms ? `<p class="bag-charms-note">${t('excludesCharms')}</p>` : ''}</div>${longDetail}<div class="detail-bottom-spacer"></div><nav class="product-action-bar"><button class="product-cart-icon" aria-label="Cart" onclick="showCart()">🛒${itemCount() ? `<i>${itemCount()}</i>` : ''}</button><button class="secondary action-add" onclick="openProductOptions('${item.id}','cart')">Add to Cart</button><button class="primary action-buy" onclick="openProductOptions('${item.id}','buy')">Buy Now</button></nav></section>${preview}`;
  };

  const directCheckout = () => {
    const chosen = state.buyNowItem, item = product(chosen?.id); if (!chosen || !item) return '';
    const sub = (chosen.sale_type === 'in_stock' ? instockPrice(item) : preorderPrice(item)) * Number(chosen.qty || 1);
    return `<section class="panel buy-now-checkout"><button class="back home-return" onclick="goBack()">${t('back')}</button><h2>Buy Now</h2><div class="cart-row"><div class="thumb"><img src="${esc(item.color_images?.[chosen.color] || item.image_url)}"></div><div><p>${esc(productName(item))}</p><small>${esc([chosen.color, chosen.size].filter(Boolean).join(' · '))}</small><br><small>× ${chosen.qty}</small></div><div class="right"><b>${money(sub)}</b></div></div>${cleanCheckout(sub)}</section>`;
  };

  const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const suggestedPrice = cost => { const value = priceNumber(cost); return value === null ? '' : Math.max(.99, Math.floor(value * 1.5 + 3) - .01).toFixed(2); };
  const pricingAdminFields = editing => {
    const cost = editing?.cost_price ?? '', preorder = editing?.preorder_price ?? editing?.price ?? '', instock = editing?.instock_price ?? (preorder === '' ? '' : (Number(preorder) + 3).toFixed(2));
    return `<section class="pricing-admin"><b>Pricing / 价格</b><small>Cost price is private. Customers and Telegram never see it.</small><div class="pricing-grid"><label class="field">Cost Price (进货成本)<span class="money-input">$ <input name="cost_price" type="number" min="0" step="0.01" value="${esc(cost)}" oninput="costPriceChanged(this)"></span></label><label class="field">Suggested Pre-order<span class="money-input">$ <input name="suggested_preorder_price" type="number" readonly value="${suggestedPrice(cost)}"></span></label><label class="field">Pre-order Price<span class="money-input">$ <input name="preorder_price" type="number" min="0" step="0.01" value="${esc(preorder)}" oninput="preorderPriceChanged(this)"></span></label><label class="field">In Stock Price<span class="money-input">$ <input name="instock_price" type="number" min="0" step="0.01" value="${esc(instock)}" oninput="this.dataset.manual='true'"></span></label><label class="field stock-quantity">In Stock Quantity<span><input name="instock_quantity" type="number" min="0" step="1" value="${Math.max(0, Number(editing?.instock_quantity ?? editing?.stock_by_sku?.default ?? 0) || 0)}"></span></label></div><button type="button" class="price-reset" onclick="useSuggestedPrice(this)">Use Suggested Price</button></section>`;
  };
  const mediaAdminFields = editing => `<div class="media-admin"><b>Product media / 商品媒体</b><small>Main image + up to 7 additional images. Video: MP4/WebM, 10 MB maximum.</small><label class="field">Main image (required for new products)<input name="main_photo" type="file" accept="image/png,image/jpeg,image/webp" ${editing ? '' : 'required'}></label><label class="field">Additional images (up to 7)<input name="extra_photos" type="file" multiple accept="image/png,image/jpeg,image/webp"></label><label class="field">Product video (optional, MP4/WebM, max 10 MB)<input name="product_video" type="file" accept="video/mp4,video/webm"></label>${gallery(editing || {}).length ? `<div class="media-existing">Current carousel images: ${gallery(editing).length}${editing.video_url ? ' · Video added' : ''}</div>` : ''}</div><div class="detail-page-admin"><b>Detail page long images / 商品详情页长图</b><small>Select images in order. They will appear continuously below the product information, from 1 onwards.</small><label class="field">Detail page images (up to 20)<input name="detail_page_photos" type="file" multiple accept="image/png,image/jpeg,image/webp" onchange="previewDetailUploadOrder(this)"></label><div id="detail-upload-order" class="detail-upload-order">${detailImages(editing).length ? `Saved detail images: ${detailImages(editing).length}` : 'No detail images yet.'}</div></div>`;

  const saveMediaProduct = async event => {
    event.preventDefault(); const form = event.currentTarget, editing = state.editId ? product(state.editId) : null, main = form.main_photo?.files?.[0], extras = [...(form.extra_photos?.files || [])], detailPages = [...(form.detail_page_photos?.files || [])], video = form.product_video?.files?.[0];
    if (state.productSaveSending) return;
    if (!editing && !main) { alert('Choose a main product image.'); return; }
    const currentImages = main ? 0 : gallery(editing || {}).length;
    if (extras.length > 7 || currentImages + extras.length > 8) { alert('A product can have at most 8 images in total.'); return; }
    if (detailPages.length > 20 || detailImages(editing).length + detailPages.length > 20) { alert('A product can have at most 20 detail page images.'); return; }
    if (video && (!['video/mp4','video/webm'].includes(video.type) || video.size > 10 * 1024 * 1024)) { alert('Use an MP4/WebM video smaller than 10 MB.'); return; }
    try {
      state.productSaveSending = true; const sendingToChannel = form.dataset.sendToChannel === 'true'; form.querySelectorAll('button').forEach(button => { button.disabled = true; }); const activeButton = form.querySelector(`[data-product-save="${sendingToChannel ? 'send' : 'only'}"]`); if (activeButton) activeButton.textContent = sendingToChannel ? 'Saving & Sending…' : 'Saving…';
      const input = Object.fromEntries(new FormData(form)); input.description_en = editing?.description_en || ''; input.description_km = editing?.description_km || ''; input.sizes = [...form.querySelectorAll('input[name="sizes"]:checked')].map(node => node.value); input.size_guides = {};
      form.querySelectorAll('[data-guide-size]').forEach(node => { const size = node.dataset.guideSize; (input.size_guides[size] ||= {})[node.dataset.guideField] = node.value.trim(); });
      input.color_images = editing?.color_images || {}; input.colorImageData = {}; await Promise.all([...form.querySelectorAll('[data-color-photo]')].map(async node => { if (node.files[0]) input.colorImageData[node.dataset.colorPhoto] = await readFile(node.files[0]); }));
      input.colors = COLOR_OPTIONS.filter(color => input.color_images[color.value] || input.colorImageData[color.value]).map(color => color.value); input.variant_sale_types = {}; input.stock_by_sku = Object.fromEntries([...form.querySelectorAll('[data-stock-sku]')].map(node => [node.dataset.stockSku, Math.max(0, Math.floor(Number(node.value) || 0))]));
      const pickedSizes = input.sizes.length ? input.sizes : ['']; form.querySelectorAll('[data-variant-type]').forEach(node => { if (!input.colors.includes(node.dataset.variantType)) return; pickedSizes.forEach(size => input.variant_sale_types[stockKey(size, node.dataset.variantType)] = node.value); });
      input.instock_quantity = Math.max(0, Math.floor(Number(form.instock_quantity?.value) || 0));
      if (!input.colors.length) input.variant_sale_types.default = 'preorder';
      if (input.instock_quantity || Object.prototype.hasOwnProperty.call(editing?.stock_by_sku || {}, 'default')) input.stock_by_sku.default = input.instock_quantity;
      input.sale_type = Object.values(input.variant_sale_types).includes('in_stock') ? 'in_stock' : 'preorder'; input.excludes_charms = Boolean(form.excludes_charms?.checked); input.published = form.published.checked; input.featured = form.featured.checked;
      input.imageDataList = await Promise.all([main, ...extras].filter(Boolean).map(readFile)); input.image_urls = gallery(editing || {}); input.image_url = editing?.image_url || ''; input.detailPageImageDataList = await Promise.all(detailPages.map(readFile)); input.detail_image_urls = detailImages(editing); input.videoData = video ? await readFile(video) : ''; input.video_url = editing?.video_url || '';
      input.delivery_notes = form.use_custom_delivery_notes?.checked ? { en: form.delivery_notes_en?.value.trim() || '', km: form.delivery_notes_km?.value.trim() || '' } : {};
      input.send_to_channel = sendingToChannel;
      const saved = await adminFetch(editing ? `/api/admin/products/${editing.id}` : '/api/admin/products', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(input) });
      const savedProduct = saved.product || saved, channel = saved.channel || { sent: false, skipped: true };
      state.channelRetryProductId = input.send_to_channel && !channel.sent ? savedProduct?.id : '';
      state.editId = null; await loadAdmin(); render();
      if (input.send_to_channel && !channel.sent) { alert('Product updated, but failed to send to channel.'); }
      else showAdminSuccess(input.send_to_channel ? 'Product saved & sent to channel ✓' : (editing ? 'Product updated ✓' : 'Product added ✓'));
      return saved;
    } catch (error) { if (error.message !== 'Cancelled') alert(error.message || 'Could not save product.'); }
    finally { state.productSaveSending = false; }
  };

  setTimeout(() => {
    const baseCart = cart, baseRequest = requestQR, baseProductAdmin = productAdmin, baseRender = render, baseProductBack = window.goBack || goBack;
    // Both the visible arrow and the left-edge gesture use this one internal
    // route. A product opened from Telegram has no store page in its trail, so
    // it deliberately enters /home instead of delegating to browser history.
    window.returnFromProduct = () => {
      if (state.view !== 'detail') return baseProductBack();
      if (window.returnFromTelegramProduct?.()) return;
      const directTelegramEntry = Boolean(state.deepLinkEntry || state.productBackTarget === 'home');
      if (directTelegramEntry || !state.pageTrail?.length) {
        state.deepLinkEntry = false; state.deepLinkProductId = ''; state.productBackTarget = ''; state.category = 'all';
        return showShop();
      }
      return baseProductBack();
    };
    goBack = () => window.returnFromProduct();
    window.goBack = goBack;
    render = () => { document.body.classList.toggle('detail-immersive', state.view === 'detail'); baseRender(); if (state.view === 'detail') requestAnimationFrame(() => { const item = product(state.productId); if (item) activateCarouselMedia(item); }); };
    productDetail = mediaProductDetail;
    const pricedCart = () => {
      const rows = state.cart.map(row => {
        const item = product(row.id); if (!item) return '';
        const saleType = row.sale_type || 'preorder', unit = saleType === 'in_stock' ? instockPrice(item) : preorderPrice(item), label = typeLabel(saleType);
        return `<div class="cart-row"><div class="thumb"><img src="${esc(item.color_images?.[row.color] || item.image_url)}"></div><div><p>${esc(productName(item))}</p><small>${esc([row.color, row.size].filter(Boolean).join(' · '))}</small><br><small class="cart-price-type">${label} · ${money(unit)}</small><div class="quantity"><button onclick="changePricedCart('${item.id}','${esc(row.size || '')}','${esc(row.color || '')}','${saleType}',-1)">−</button> ${row.qty} <button onclick="changePricedCart('${item.id}','${esc(row.size || '')}','${esc(row.color || '')}','${saleType}',1)">+</button></div></div><div class="right"><b>${money(unit * Number(row.qty || 1))}</b><br><button class="back" onclick="removePricedCart('${item.id}','${esc(row.size || '')}','${esc(row.color || '')}','${saleType}')">×</button></div></div>`;
      }).join('');
      const sub = state.cart.reduce((total, row) => { const item = product(row.id); return total + (item ? (row.sale_type === 'in_stock' ? instockPrice(item) : preorderPrice(item)) * Number(row.qty || 0) : 0); }, 0);
      return `<section class="panel"><button class="back home-return" onclick="goBack()">${t('continue')}</button><h2>${t('yourOrder')}</h2>${rows || `<div class="empty">${t('empty')}</div>`}${state.cart.length ? cleanCheckout(sub) : ''}</section>`;
    };
    window.changePricedCart = (id, size, color, saleType, delta) => {
      const row = state.cart.find(entry => entry.id === id && (entry.size || '') === size && (entry.color || '') === color && (entry.sale_type || 'preorder') === saleType), item = product(id);
      if (!row || !item) return;
      const max = saleType === 'in_stock' ? stockForChoice(item, size, color) : 99;
      row.qty = Math.max(1, Math.min(max || 1, Number(row.qty || 1) + Number(delta || 0)));
      save(); render();
    };
    window.removePricedCart = (id, size, color, saleType) => { state.cart = state.cart.filter(entry => !(entry.id === id && (entry.size || '') === size && (entry.color || '') === color && (entry.sale_type || 'preorder') === saleType)); save(); render(); };
    cart = () => state.buyNowItem ? directCheckout() : pricedCart();
    requestQR = async () => {
      if (!state.buyNowItem) return baseRequest();
      const chosen = state.buyNowItem, item = product(chosen.id), name = $('#customer-name')?.value.trim(), contact = $('#customer-contact')?.value.trim(), address = $('#customer-address')?.value.trim();
      if (!item || !name || !contact || (state.delivery === 'delivery' && !address)) { alert('Please complete the order details.'); return; }
      try {
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ telegramInitData: window.Telegram?.WebApp?.initData || '', name, contact, address, delivery: state.delivery, region: state.region, items: [{ id:item.id, size:chosen.size, color:chosen.color, sale_type:chosen.sale_type || 'preorder', quantity:chosen.qty }] }) });
        const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not create order.'); state.buyNowItem = null; alert(t('orderSent')); showShop();
      } catch (error) { alert(error.message || t('serverError')); }
    };
    const buyNowRequest = requestQR;
    requestQR = async () => {
      if (state.buyNowItem) return buyNowRequest();
      const name = $('#customer-name')?.value.trim(), contact = $('#customer-contact')?.value.trim(), address = $('#customer-address')?.value.trim();
      if (!name || !contact || (state.delivery === 'delivery' && !address)) { alert('Please complete the order details.'); return; }
      const items = state.cart.map(row => ({ id: row.id, size: row.size || '', color: row.color || '', sale_type: row.sale_type || 'preorder', quantity: row.qty }));
      try {
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ telegramInitData: window.Telegram?.WebApp?.initData || '', name, contact, address, delivery: state.delivery, region: state.region, items }) });
        const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not create order.');
        state.cart = []; save(); alert(t('orderSent')); showShop();
      } catch (error) { alert(error.message || t('serverError')); }
    };
    productAdmin = () => {
      const editing = state.editId ? product(state.editId) : null;
      let html = baseProductAdmin();
      html = html.replace(/<label class="field">(?:(?!<\/label>)[\s\S])*?<input name="price"[\s\S]*?<\/label>/, pricingAdminFields(editing));
      html = html.replace(/<label class="field">[^<]*<input name="main_photo"[\s\S]*?<\/label><label class="field">[^<]*<input name="detail_photo"[\s\S]*?<\/label>/, mediaAdminFields(editing));
      html = html.replace('<div class="checks">', '<div class="checks">');
      const retry = state.channelRetryProductId ? `<div class="channel-send-retry">Product saved, but it was not sent to the channel.<button type="button" onclick="sendProductAgain('${state.channelRetryProductId}')" ${state.channelRetrySending ? 'disabled' : ''}>${state.channelRetrySending ? 'Sending…' : 'Send Again'}</button></div>` : '';
      html = html.replace('<form id="product-form"', `${retry}<form id="product-form"`);
      html = html.replace(/<button class="primary">[^<]*<\/button>/, editing ? '<div class="product-save-actions"><button type="submit" data-product-save="only" class="primary" onclick="this.form.dataset.sendToChannel=\'false\'">Update</button></div>' : '<div class="product-save-actions"><button type="submit" data-product-save="send" class="primary" onclick="this.form.dataset.sendToChannel=\'true\'">Save &amp; Send to Channel</button></div>');
      return html;
    };
    window.costPriceChanged = input => {
      const form = input.form, suggested = form?.suggested_preorder_price, preorder = form?.preorder_price, instock = form?.instock_price;
      const next = suggestedPrice(input.value); if (suggested) suggested.value = next;
      if (preorder && !preorder.dataset.manual) { preorder.value = next; if (instock && !instock.dataset.manual) instock.value = next ? (Number(next) + 3).toFixed(2) : ''; }
    };
    window.preorderPriceChanged = input => { input.dataset.manual = 'true'; const instock = input.form?.instock_price; if (instock && !instock.dataset.manual) instock.value = input.value === '' ? '' : (Number(input.value || 0) + 3).toFixed(2); };
    window.useSuggestedPrice = button => { const form = button.form || button.closest('form'), suggested = form?.suggested_preorder_price?.value; if (!form || !suggested) return; form.preorder_price.value = suggested; form.preorder_price.dataset.manual = ''; form.instock_price.value = (Number(suggested) + 3).toFixed(2); form.instock_price.dataset.manual = ''; };
    window.sendProductAgain = async id => {
      if (state.channelRetrySending) return; state.channelRetrySending = true; render();
      try { const result = await adminFetch(`/api/admin/products/${id}/send-channel`, { method: 'POST', body: JSON.stringify({}) }); if (!result.channel?.sent) throw Error(result.channel?.error || 'Could not send to channel.'); state.channelRetryProductId = ''; showAdminSuccess('Product sent to channel ✓'); }
      catch (error) { alert(error.message || 'Could not send to channel.'); }
      finally { state.channelRetrySending = false; render(); }
    };
    window.previewDetailUploadOrder = input => { const target = document.querySelector('#detail-upload-order'); if (target) target.textContent = input.files?.length ? [...input.files].map((file, index) => `${index + 1}. ${file.name}`).join('  ·  ') : 'No new detail images selected.'; };
    saveProduct = saveMediaProduct;
    if (state.view === 'detail') render();
  }, 0);
})();
