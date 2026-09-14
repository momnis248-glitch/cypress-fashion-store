// Product media, carousel and purchase-sheet layer. Loaded last so it can
// extend the historical storefront without resetting its route memory.
(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const product = id => state.products.find(item => item.id === id);
  const gallery = item => {
    const urls = [item.image_url, ...(Array.isArray(item.image_urls) ? item.image_urls : [])].filter(Boolean);
    return [...new Set(urls)].slice(0, 8);
  };
  const itemCount = () => state.cart.reduce((count, item) => count + Number(item.qty || 0), 0);
  const languageIsKhmer = () => state.language === 'km';
  const typeLabel = (type) => languageIsKhmer() ? (type === 'in_stock' ? 'មានស្តុក' : 'បញ្ជាទិញមុន') : (type === 'in_stock' ? 'IN STOCK' : 'PRE-ORDER');
  const deliveryText = item => {
    if (languageIsKhmer()) return `ដឹកជញ្ជូន · 3–4 ថ្ងៃ<br>មកយកដោយខ្លួនឯង · អាចមកយកបានបន្ទាប់ពីចេញពីធ្វើការនៅថ្ងៃបន្ទាប់<br>${esc(state.settings.pickup || 'National Road No. 4, KM 82, T20 Factory Security Room')}`;
    return item.sale_type === 'preorder' ? 'Pre-order · 15–18 days' : `Delivery · 3–4 days<br>Pickup · Available after work the next day<br>${esc(state.settings.pickup || 'National Road No. 4, KM 82, T20 Factory Security Room')}`;
  };
  const mediaItems = item => {
    const images = gallery(item);
    if (!images.length) return [];
    return [{ kind: 'image', url: images[0] }, ...(item.video_url ? [{ kind: 'video', url: item.video_url }] : []), ...images.slice(1).map(url => ({ kind: 'image', url }))];
  };
  const carouselHtml = item => {
    const media = mediaItems(item), indexMap = state.productCarouselIndex || (state.productCarouselIndex = {}), current = Math.min(indexMap[item.id] || 0, Math.max(0, media.length - 1)), active = media[current];
    if (!active) return '<div class="product-carousel empty-media">No product image</div>';
    const asset = active.kind === 'video'
      ? `<video controls playsinline preload="metadata" muted src="${esc(active.url)}"></video><span class="video-chip">▶ Video</span>`
      : `<img src="${esc(active.url)}" alt="${esc(productName(item))}" loading="eager">`;
    return `<div id="product-media-carousel" class="product-carousel" ontouchstart="carouselTouchStart(event,'${item.id}')" ontouchend="carouselTouchEnd(event,'${item.id}')">${asset}${media.length > 1 ? `<button class="carousel-arrow previous" aria-label="Previous" onclick="moveCarousel('${item.id}',-1)">‹</button><button class="carousel-arrow next" aria-label="Next" onclick="moveCarousel('${item.id}',1)">›</button><span class="carousel-count">${current + 1}/${media.length}</span>` : ''}</div>`;
  };
  window.moveCarousel = (id, direction) => {
    const item = product(id); if (!item) return;
    document.querySelectorAll('#product-media-carousel video').forEach(video => video.pause());
    const media = mediaItems(item), map = state.productCarouselIndex || (state.productCarouselIndex = {});
    map[id] = (Math.max(0, map[id] || 0) + direction + media.length) % media.length;
    const target = document.querySelector('#product-media-carousel');
    if (target) target.outerHTML = carouselHtml(item);
  };
  let touchX = null;
  window.carouselTouchStart = event => { touchX = event.changedTouches?.[0]?.clientX ?? null; };
  window.carouselTouchEnd = (event, id) => { const x = event.changedTouches?.[0]?.clientX; if (touchX !== null && Math.abs(x - touchX) > 40) window.moveCarousel(id, x < touchX ? 1 : -1); touchX = null; };

  const optionType = (item, size, color) => variantType(item, size, color);
  const optionStock = (item, size, color) => variantStock(item, size, color);
  const comboAvailable = (item, size, color) => optionType(item, size, color) !== 'in_stock' || optionStock(item, size, color) > 0;
  const optionSheet = item => {
    const draft = state.productOptionDraft || {}, sizes = item.category === 'clothes' ? (item.sizes || []) : [], colors = item.colors || [];
    const selectedSize = draft.size || '', selectedColor = draft.color || '', selectedType = optionType(item, selectedSize, selectedColor), max = selectedType === 'in_stock' ? optionStock(item, selectedSize, selectedColor) : 99;
    const colorButtons = colors.length ? `<div class="option-group"><b>${languageIsKhmer() ? 'ពណ៌' : 'Color'}</b><div class="option-buttons">${colors.map(color => { const enabled = !sizes.length ? comboAvailable(item, '', color) : (!selectedSize || comboAvailable(item, selectedSize, color)); const photo = item.color_images?.[color]; return `<button type="button" class="option-button ${selectedColor === color ? 'selected' : ''}" ${enabled ? '' : 'disabled'} onclick="setProductOption('color','${esc(color)}')">${photo ? `<img src="${esc(photo)}" alt="">` : ''}${esc(colorName ? colorName(color) : color)}</button>`; }).join('')}</div></div>` : '';
    const sizeButtons = sizes.length ? `<div class="option-group"><b>${languageIsKhmer() ? 'ទំហំ' : 'Size'}</b><div class="option-buttons">${sizes.map(size => { const enabled = !colors.length ? comboAvailable(item, size, '') : (!selectedColor || comboAvailable(item, size, selectedColor)); return `<button type="button" class="option-button ${selectedSize === size ? 'selected' : ''}" ${enabled ? '' : 'disabled'} onclick="setProductOption('size','${esc(size)}')">${esc(size)}</button>`; }).join('')}</div></div>` : '';
    return `<div class="option-overlay" onclick="closeProductOptions(event)"><section class="option-sheet" onclick="event.stopPropagation()"><div class="sheet-title"><b>${languageIsKhmer() ? 'ជ្រើសរើសលក្ខណៈ' : 'Choose options'}</b><button type="button" class="sheet-close" onclick="closeProductOptions()">×</button></div><div class="sheet-product"><img src="${esc((item.color_images?.[selectedColor]) || item.image_url)}"><span>${esc(productName(item))}<strong>${money(item.price)}</strong></span></div>${colorButtons}${sizeButtons}<div class="option-group quantity-picker"><b>${languageIsKhmer() ? 'ចំនួន' : 'Quantity'}</b><div><button type="button" onclick="adjustProductQuantity(-1)">−</button><span>${Math.max(1, Number(draft.qty || 1))}</span><button type="button" ${max <= Number(draft.qty || 1) ? 'disabled' : ''} onclick="adjustProductQuantity(1)">+</button></div></div>${selectedType === 'in_stock' && selectedColor || selectedSize ? `<small class="stock-tip">${selectedType === 'in_stock' ? `${max} ${languageIsKhmer() ? 'នៅសល់' : 'in stock'}` : typeLabel('preorder')}</small>` : ''}<button type="button" class="primary sheet-confirm" onclick="confirmProductOptions()">${draft.mode === 'buy' ? (languageIsKhmer() ? 'បន្តការទូទាត់' : 'Confirm') : (languageIsKhmer() ? 'បន្ថែមទៅកន្ត្រក' : 'Add to Cart')}</button></section></div>`;
  };
  const refreshOptionSheet = () => { const item = product(state.productOptionDraft?.id); const overlay = document.querySelector('.option-overlay'); if (item && overlay) overlay.outerHTML = optionSheet(item); };
  window.openProductOptions = (id, mode) => { const item = product(id); if (!item) return; state.productOptionDraft = { id, mode, size: '', color: '', qty: 1 }; document.body.insertAdjacentHTML('beforeend', optionSheet(item)); };
  window.closeProductOptions = event => { if (event && event.target !== event.currentTarget) return; document.querySelector('.option-overlay')?.remove(); state.productOptionDraft = null; };
  window.setProductOption = (key, value) => { const draft = state.productOptionDraft; if (!draft) return; draft[key] = value; const item = product(draft.id); if (item && optionType(item, draft.size, draft.color) === 'in_stock') draft.qty = Math.min(draft.qty, Math.max(1, optionStock(item, draft.size, draft.color))); refreshOptionSheet(); };
  window.adjustProductQuantity = delta => { const draft = state.productOptionDraft, item = product(draft?.id); if (!draft || !item) return; const max = optionType(item, draft.size, draft.color) === 'in_stock' ? optionStock(item, draft.size, draft.color) : 99; draft.qty = Math.max(1, Math.min(max || 1, Number(draft.qty || 1) + delta)); refreshOptionSheet(); };
  window.confirmProductOptions = () => {
    const draft = state.productOptionDraft, item = product(draft?.id); if (!draft || !item) return;
    if ((item.colors?.length && !draft.color) || (item.category === 'clothes' && item.sizes?.length && !draft.size)) { alert('Please select all options.'); return; }
    if (!comboAvailable(item, draft.size, draft.color)) { alert('This option is sold out.'); return; }
    const chosen = { id: item.id, size: draft.size, color: draft.color, qty: Number(draft.qty || 1) };
    document.querySelector('.option-overlay')?.remove();
    if (draft.mode === 'buy') { state.buyNowItem = chosen; state.productOptionDraft = null; showCart(); return; }
    const existing = state.cart.find(row => row.id === chosen.id && row.size === chosen.size && row.color === chosen.color);
    const maximum = optionType(item, chosen.size, chosen.color) === 'in_stock' ? optionStock(item, chosen.size, chosen.color) : 99;
    if (existing) existing.qty = Math.min(maximum, existing.qty + chosen.qty); else state.cart.push(chosen);
    state.productOptionDraft = null; save(); render(); alert(languageIsKhmer() ? 'បានបន្ថែមទៅកន្ត្រក ✓' : 'Added to cart ✓');
  };

  const mediaProductDetail = () => {
    const item = product(state.productId); if (!item) return `<section class="panel"><p>This product is currently unavailable.</p><button class="back home-return" onclick="showShop()">Continue Shopping</button></section>`;
    const type = optionType(item, '', ''), brief = languageIsKhmer() ? item.description_km : item.description_en;
    return `<section class="product-detail product-detail-media"><button class="back home-return detail-back" onclick="showShop()">${t('backToShop')}</button>${carouselHtml(item)}<div class="detail-media-info"><h2>${esc(productName(item))}</h2>${brief ? `<p class="product-brief">${esc(brief)}</p>` : ''}<div class="detail-price-row">${variantSaleBadge(type)}<strong>${money(item.price)}</strong></div><div class="delivery-mini"><b>${languageIsKhmer() ? 'ការដឹកជញ្ជូន' : 'Delivery information'}</b><span>${deliveryText(item)}</span></div>${item.category === 'bags' && item.excludes_charms ? `<p class="bag-charms-note">${t('excludesCharms')}</p>` : ''}</div><div class="detail-bottom-spacer"></div><nav class="product-action-bar"><button class="product-cart-icon" aria-label="Cart" onclick="showCart()">🛒${itemCount() ? `<i>${itemCount()}</i>` : ''}</button><button class="secondary action-add" onclick="openProductOptions('${item.id}','cart')">Add to Cart</button><button class="primary action-buy" onclick="openProductOptions('${item.id}','buy')">Buy Now</button></nav></section>`;
  };

  const directCheckout = () => {
    const chosen = state.buyNowItem, item = product(chosen?.id); if (!chosen || !item) return '';
    const sub = Number(item.price) * Number(chosen.qty || 1);
    return `<section class="panel buy-now-checkout"><button class="back home-return" onclick="goBack()">${t('back')}</button><h2>Buy Now</h2><div class="cart-row"><div class="thumb"><img src="${esc(item.color_images?.[chosen.color] || item.image_url)}"></div><div><p>${esc(productName(item))}</p><small>${esc([chosen.color, chosen.size].filter(Boolean).join(' · '))}</small><br><small>× ${chosen.qty}</small></div><div class="right"><b>${money(sub)}</b></div></div>${cleanCheckout(sub)}</section>`;
  };

  const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const mediaAdminFields = editing => `<div class="media-admin"><b>Product media / 商品媒体</b><small>Main image + up to 7 additional images. Video: MP4/WebM, 10 MB maximum.</small><label class="field">Main image (required for new products)<input name="main_photo" type="file" accept="image/png,image/jpeg,image/webp" ${editing ? '' : 'required'}></label><label class="field">Additional images (up to 7)<input name="extra_photos" type="file" multiple accept="image/png,image/jpeg,image/webp"></label><label class="field">Product video (optional, MP4/WebM, max 10 MB)<input name="product_video" type="file" accept="video/mp4,video/webm"></label>${gallery(editing || {}).length ? `<div class="media-existing">Current images: ${gallery(editing).length}${editing.video_url ? ' · Video added' : ''}</div>` : ''}</div>`;

  const saveMediaProduct = async event => {
    event.preventDefault(); const form = event.currentTarget, editing = state.editId ? product(state.editId) : null, main = form.main_photo?.files?.[0], extras = [...(form.extra_photos?.files || [])], video = form.product_video?.files?.[0];
    if (!editing && !main) { alert('Choose a main product image.'); return; }
    if (extras.length > 7) { alert('Choose no more than 7 additional images.'); return; }
    if (video && (!['video/mp4','video/webm'].includes(video.type) || video.size > 10 * 1024 * 1024)) { alert('Use an MP4/WebM video smaller than 10 MB.'); return; }
    try {
      const input = Object.fromEntries(new FormData(form)); input.sizes = [...form.querySelectorAll('input[name="sizes"]:checked')].map(node => node.value); input.size_guides = {};
      form.querySelectorAll('[data-guide-size]').forEach(node => { const size = node.dataset.guideSize; (input.size_guides[size] ||= {})[node.dataset.guideField] = node.value.trim(); });
      input.color_images = editing?.color_images || {}; input.colorImageData = {}; await Promise.all([...form.querySelectorAll('[data-color-photo]')].map(async node => { if (node.files[0]) input.colorImageData[node.dataset.colorPhoto] = await readFile(node.files[0]); }));
      input.colors = COLOR_OPTIONS.filter(color => input.color_images[color.value] || input.colorImageData[color.value]).map(color => color.value); input.variant_sale_types = {}; input.stock_by_sku = Object.fromEntries([...form.querySelectorAll('[data-stock-sku]')].map(node => [node.dataset.stockSku, Math.max(0, Math.floor(Number(node.value) || 0))]));
      const pickedSizes = input.sizes.length ? input.sizes : ['']; form.querySelectorAll('[data-variant-type]').forEach(node => { if (!input.colors.includes(node.dataset.variantType)) return; pickedSizes.forEach(size => input.variant_sale_types[stockKey(size, node.dataset.variantType)] = node.value); });
      if (!input.colors.length) input.variant_sale_types.default = 'preorder'; input.sale_type = Object.values(input.variant_sale_types).includes('in_stock') ? 'in_stock' : 'preorder'; input.excludes_charms = Boolean(form.excludes_charms?.checked); input.published = form.published.checked; input.featured = form.featured.checked;
      input.imageDataList = await Promise.all([main, ...extras].filter(Boolean).map(readFile)); input.image_urls = gallery(editing || {}); input.image_url = editing?.image_url || ''; input.videoData = video ? await readFile(video) : ''; input.video_url = editing?.video_url || '';
      input.delivery_notes = { en: form.delivery_notes_en?.value || editing?.delivery_notes?.en || '', km: form.delivery_notes_km?.value || editing?.delivery_notes?.km || '' };
      const saved = await adminFetch(editing ? `/api/admin/products/${editing.id}` : '/api/admin/products', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(input) });
      state.editId = null; await loadAdmin(); render(); showAdminSuccess(editing ? 'Product updated ✓' : 'Product added ✓'); return saved;
    } catch (error) { if (error.message !== 'Cancelled') alert(error.message || 'Could not save product.'); }
  };

  setTimeout(() => {
    const baseCart = cart, baseRequest = requestQR, baseProductAdmin = productAdmin;
    productDetail = mediaProductDetail;
    cart = () => state.buyNowItem ? directCheckout() : baseCart();
    requestQR = async () => {
      if (!state.buyNowItem) return baseRequest();
      const chosen = state.buyNowItem, item = product(chosen.id), name = $('#customer-name')?.value.trim(), contact = $('#customer-contact')?.value.trim(), address = $('#customer-address')?.value.trim();
      if (!item || !name || !contact || (state.delivery === 'delivery' && !address)) { alert('Please complete the order details.'); return; }
      try {
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ telegramInitData: window.Telegram?.WebApp?.initData || '', name, contact, address, delivery: state.delivery, region: state.region, items: [{ id:item.id, size:chosen.size, color:chosen.color, quantity:chosen.qty }] }) });
        const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not create order.'); state.buyNowItem = null; alert(t('orderSent')); showShop();
      } catch (error) { alert(error.message || t('serverError')); }
    };
    productAdmin = () => {
      const editing = state.editId ? product(state.editId) : null;
      let html = baseProductAdmin();
      html = html.replace(/<label class="field">[^<]*<input name="main_photo"[\s\S]*?<\/label><label class="field">[^<]*<input name="detail_photo"[\s\S]*?<\/label>/, mediaAdminFields(editing));
      html = html.replace('<div class="checks">', `<label class="field">Brief description (English)<textarea name="description_en">${esc(editing?.description_en || '')}</textarea></label><label class="field">សេចក្តីពិពណ៌នាខ្លី (Khmer)<textarea name="description_km">${esc(editing?.description_km || '')}</textarea></label><div class="checks">`);
      return html;
    };
    saveProduct = saveMediaProduct;
    if (state.view === 'detail') render();
  }, 0);
})();
