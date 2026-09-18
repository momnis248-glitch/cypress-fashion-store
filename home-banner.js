/* Home Banner + compact customer navigation.
   This file deliberately sits after the existing shop modules so it extends the
   storefront without changing product, cart, order, or inventory behaviour. */
(() => {
  window.homeBannerShop = true;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  const normalizedBanners = value => (Array.isArray(value) ? value : [])
    .filter(item => item && item.image_url)
    .slice(0, 3)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  const visibleBanners = () => normalizedBanners(state.settings?.banners).filter(item => item.enabled !== false);
  const activeIndex = () => {
    const count = visibleBanners().length;
    state.bannerIndex = count ? Math.max(0, Math.min(Number(state.bannerIndex || 0), count - 1)) : 0;
    return state.bannerIndex;
  };
  const policyText = () => state.language === 'km' ? 'ដឹកជញ្ជូនឥតគិតថ្លៃ សម្រាប់ការបញ្ជាទិញចាប់ពី $25' : 'FREE SHIPPING ON ORDERS $25+';
  const bannerCarousel = () => {
    const banners = visibleBanners();
    if (!banners.length) {
      const headline = state.language === 'km' ? state.settings.hero_km : state.settings.hero_en;
      const intro = state.language === 'km' ? state.settings.hero_text_km : state.settings.hero_text_en;
      return `<section class="home-banner home-banner-fallback"><div class="home-banner-fallback-content"><span>${escapeHtml(t('heroTag'))}</span><h1>${escapeHtml(headline || '')}</h1><p>${escapeHtml(intro || '')}</p></div></section>`;
    }
    const selected = activeIndex();
    return `<section class="home-banner" aria-label="Store promotions" onpointerdown="homeBannerPointerStart(event)" onpointerup="homeBannerPointerEnd(event)">
      <div class="home-banner-track" style="transform:translate3d(-${selected * 100}%,0,0)">${banners.map((banner, index) => `<button type="button" class="home-banner-slide" data-banner-index="${index}" onclick="openBannerLink(${index})" aria-label="Banner ${index + 1}"><img src="${escapeHtml(banner.image_url)}" alt="Store banner ${index + 1}" ${index === selected ? 'fetchpriority="high"' : 'loading="lazy"'}></button>`).join('')}</div>
      ${banners.length > 1 ? `<div class="home-banner-dots">${banners.map((_, index) => `<button type="button" class="${index === selected ? 'active' : ''}" aria-label="Show banner ${index + 1}" onclick="setHomeBanner(${index})"></button>`).join('')}</div>` : ''}
    </section>`;
  };
  const bottomNavigation = () => `<nav class="home-bottom-nav" aria-label="Store navigation">
    <button type="button" onclick="setLanguage()"><span aria-hidden="true">◎</span><b>${state.language === 'km' ? 'EN' : 'ខ្មែរ'}</b><small>${state.language === 'km' ? 'Language' : 'ភាសា'}</small></button>
    <button type="button" onclick="showCart()"><span aria-hidden="true">🛒</span><b>${state.cart.reduce((total, item) => total + Number(item.qty || 0), 0)}</b><small>Cart</small></button>
    <button type="button" onclick="showMyOrders()"><span aria-hidden="true">▤</span><b>⌁</b><small>${state.language === 'km' ? 'ការបញ្ជាទិញ' : 'My Orders'}</small></button>
  </nav>`;
  const productCards = products => products.map(product => {
    const sold = typeof productSoldOut === 'function' && productSoldOut(product);
    const type = typeof productCardType === 'function' ? productCardType(product) : product.sale_type;
    const name = productName(product);
    const badge = typeof variantSaleBadge === 'function' ? variantSaleBadge(type) : '';
    return `<article class="product product-showcase ${sold ? 'sold-out-card' : ''}"><button class="product-image product-image-button" onclick="showProduct('${escapeHtml(product.id)}')">${image(product)}${sold ? '<span class="sold-out-overlay">SOLD OUT<br>អស់ស្តុក</span>' : ''}</button><div class="showcase-info showcase-info-aligned"><h3 class="showcase-name ${name.length > 20 ? 'two-lines' : ''}"><button class="title-button" onclick="showProduct('${escapeHtml(product.id)}')">${escapeHtml(name)}</button></h3><div class="showcase-bottom">${badge}<div class="showcase-price">${money(product.price)}</div></div></div></article>`;
  }).join('');
  const homeShop = () => {
    const list = state.category === 'all' ? state.products.filter(product => product.featured) : state.products.filter(product => product.category === state.category);
    const categories = ['all', 'clothes', 'bags', 'shoes', 'charms'];
    return `<div class="home-page">
      ${bannerCarousel()}
      <div class="home-shipping-ribbon">${policyText()}</div>
      ${typeof channelButton === 'function' ? channelButton() : ''}
      <div class="section-head"><h2>${t('featured')}</h2><small>${list.length} ${t('items')}</small></div>
      <div class="filters">${categories.map(category => `<button class="filter ${state.category === category ? 'selected' : ''}" onclick="setCategory('${category}')">${t(category)}</button>`).join('')}</div>
      <div class="products product-showcase-list">${list.length ? productCards(list) : `<div class="empty">${t('noProducts')}</div>`}</div>
      ${bottomNavigation()}
    </div>`;
  };
  const applyBannerPosition = () => {
    const track = document.querySelector('.home-banner-track');
    if (!track) return;
    track.style.transform = `translate3d(-${activeIndex() * 100}%,0,0)`;
    document.querySelectorAll('.home-banner-dots button').forEach((dot, index) => dot.classList.toggle('active', index === activeIndex()));
  };
  const resetAutoplay = () => {
    clearInterval(state.bannerAutoplayTimer);
    if (state.view !== 'shop' || visibleBanners().length < 2) return;
    state.bannerAutoplayTimer = setInterval(() => {
      if (state.view !== 'shop' || document.hidden) return;
      state.bannerIndex = (activeIndex() + 1) % visibleBanners().length;
      applyBannerPosition();
    }, 4600);
  };
  window.setHomeBanner = index => { state.bannerIndex = Number(index) || 0; applyBannerPosition(); resetAutoplay(); };
  window.homeBannerPointerStart = event => { state.homeBannerStartX = event.clientX; };
  window.homeBannerPointerEnd = event => {
    const start = Number(state.homeBannerStartX); const delta = event.clientX - start;
    if (Math.abs(delta) > 36) {
      const count = visibleBanners().length;
      state.bannerIndex = (activeIndex() + (delta < 0 ? 1 : -1) + count) % count;
      applyBannerPosition(); resetAutoplay();
    }
    state.homeBannerStartX = null;
  };
  window.openBannerLink = index => {
    const link = visibleBanners()[index]?.link || '';
    if (/^product:/i.test(link)) return showProduct(link.split(':')[1]);
    if (/^category:/i.test(link)) return setCategory(link.split(':')[1]);
    if (/^https:\/\//i.test(link)) return window.Telegram?.WebApp?.openLink ? Telegram.WebApp.openLink(link) : window.open(link, '_blank', 'noopener');
  };
  const blankBanner = () => ({ id: '', image_url: '', image_data: '', enabled: true, link: '', sort: 0 });
  const bannerDraft = () => {
    if (!Array.isArray(state.bannerDraft)) state.bannerDraft = normalizedBanners(state.settings?.banners).map(item => ({ ...blankBanner(), ...item }));
    while (state.bannerDraft.length < 3) state.bannerDraft.push(blankBanner());
    return state.bannerDraft;
  };
  const bannerManager = () => `<section class="panel banner-management"><h2>Banner Management / Banner 管理</h2><p class="description">Upload up to three home banners. Drag-free ordering keeps the storefront fast on mobile.</p><div class="banner-admin-list">${bannerDraft().map((banner, index) => `<article class="banner-admin-item"><div class="banner-admin-preview">${banner.image_data || banner.image_url ? `<img src="${escapeHtml(banner.image_data || banner.image_url)}" alt="Banner ${index + 1}">` : `<span>Banner ${index + 1}</span>`}</div><div class="banner-admin-fields"><b>Banner ${index + 1}</b><label class="field">Image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="bannerFileChanged(this,${index})"></label><label class="field">Link (optional)<input value="${escapeHtml(banner.link)}" placeholder="product:ID · category:bags · https://…" oninput="setBannerLink(${index},this.value)"></label><label class="admin-choice"><input type="checkbox" ${banner.enabled !== false ? 'checked' : ''} onchange="setBannerEnabled(${index},this.checked)"> Enabled</label><div class="banner-admin-actions"><button type="button" class="secondary" onclick="moveBannerSlot(${index},-1)" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="secondary" onclick="moveBannerSlot(${index},1)" ${index === 2 ? 'disabled' : ''}>↓</button><button type="button" class="danger" onclick="deleteBannerSlot(${index})">Delete</button></div></div></article>`).join('')}</div><button type="button" class="primary" onclick="saveBanners()">Save Banners</button></section>`;
  setTimeout(() => {
    const baseSettingsAdmin = settingsAdmin;
    shop = homeShop;
    settingsAdmin = () => `${baseSettingsAdmin()}${bannerManager()}`;
    window.bannerFileChanged = async (input, index) => {
      const file = input.files?.[0]; if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return alert('Use a PNG, JPG, or WebP image.');
      const reader = new FileReader(); reader.onload = () => { bannerDraft()[index] = { ...bannerDraft()[index], image_data: String(reader.result), image_url: '' }; render(); }; reader.readAsDataURL(file);
    };
    window.setBannerLink = (index, link) => { bannerDraft()[index].link = String(link || ''); };
    window.setBannerEnabled = (index, enabled) => { bannerDraft()[index].enabled = enabled; };
    window.deleteBannerSlot = index => { bannerDraft()[index] = blankBanner(); render(); };
    window.moveBannerSlot = (index, direction) => { const target = index + direction; if (target < 0 || target > 2) return; const draft = bannerDraft(); [draft[index], draft[target]] = [draft[target], draft[index]]; render(); };
    window.saveBanners = async () => {
      const button = document.querySelector('.banner-management .primary'); if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      try {
        const payload = bannerDraft().filter(banner => banner.image_data || banner.image_url).map((banner, index) => ({ ...banner, sort: index }));
        const saved = await adminFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ banners: payload }) });
        state.settings = { ...state.settings, ...saved }; state.bannerDraft = normalizedBanners(saved.banners).map(item => ({ ...blankBanner(), ...item })); render();
        if (typeof showAdminSuccess === 'function') showAdminSuccess('Banners saved ✓');
      } catch (error) { alert(error.message || 'Could not save banners.'); if (button) { button.disabled = false; button.textContent = 'Save Banners'; } }
    };
    if (state.view === 'shop') render();
    resetAutoplay();
  }, 20);
})();
