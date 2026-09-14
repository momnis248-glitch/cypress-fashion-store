// Shop-category navigation memory. Kept only for the current webview session.
// It complements the general page-memory route by keeping an independent scroll
// position for each customer-facing category.
(() => {
  if (window.__cypressCategoryMemoryEnabled) return;
  window.__cypressCategoryMemoryEnabled = true;

  const categoryKey = 'cypress-shop-category-memory-v1';
  const validCategories = new Set(['all', 'clothes', 'bags', 'charms']);
  let saved = {};
  try {
    const value = JSON.parse(sessionStorage.getItem(categoryKey) || '{}');
    if (value && typeof value === 'object') saved = value;
  } catch {}
  state.categoryMemory = saved;

  const remember = (category = state.category) => {
    if (state.view !== 'shop' || !validCategories.has(category)) return;
    const current = state.categoryMemory[category] || {};
    state.categoryMemory[category] = {
      ...current,
      scrollY: Math.max(0, window.scrollY || window.pageYOffset || 0),
      loadedCount: document.querySelectorAll('.product-showcase, .product').length,
      sort: state.shopSort || '',
      filters: state.shopFilters || null
    };
    try { sessionStorage.setItem(categoryKey, JSON.stringify(state.categoryMemory)); } catch {}
  };

  const restorePosition = (position, allowTop = false) => {
    const top = Math.max(0, Number(position) || 0);
    // A category click at the top needs no scroll command at all. This avoids
    // introducing a synthetic scroll-to-top during the category update.
    if (!top && !allowTop) return;
    const move = () => window.scrollTo({ top, left: 0, behavior: 'auto' });
    requestAnimationFrame(() => { move(); requestAnimationFrame(move); });
    document.querySelectorAll('img').forEach(image => {
      if (!image.complete) image.addEventListener('load', move, { once: true });
    });
  };

  const restore = (category) => restorePosition(state.categoryMemory[category]?.scrollY, true);

  function featuredCategoryShop() {
    const list = state.category === 'all'
      ? state.products.filter(product => product?.featured === true && product?.published !== false)
      : state.products.filter(product => product.category === state.category);
    const hero = state.language === 'km' ? state.settings.hero_km : state.settings.hero_en;
    const heroText = state.language === 'km' ? state.settings.hero_text_km : state.settings.hero_text_en;
    return `<section class="hero"><div class="hero-main"><div class="eyebrow">${t('heroTag')}</div><h1>${hero}</h1><p>${heroText}</p></div><div class="hero-side"><strong>${typeof newArrivalText === 'function' ? newArrivalText() : t('new')}</strong></div></section>${customerActions()}${typeof channelButton === 'function' ? channelButton() : ''}<div class="section-head"><h2>${t('featured')}</h2><small>${list.length} ${t('items')}</small></div><div class="filters">${['all','clothes','bags','charms'].map(category => `<button data-category="${category}" class="filter ${state.category === category ? 'selected' : ''}" onclick="setCategory('${category}')">${t(category)}</button>`).join('')}</div><div class="products product-showcase-list">${list.map(product => { const sold = productSoldOut(product), type = productCardType(product), name = productName(product); return `<article class="product product-showcase ${sold ? 'sold-out-card' : ''}"><button class="product-image product-image-button" onclick="showProduct('${product.id}')">${image(product)}${sold ? '<span class="sold-out-overlay">SOLD OUT<br>អស់ស្តុក</span>' : ''}</button><div class="showcase-info showcase-info-aligned"><h3 class="showcase-name ${name.length > 20 ? 'two-lines' : ''}"><button class="title-button" onclick="showProduct('${product.id}')">${name}</button></h3><div class="showcase-bottom">${variantSaleBadge(type)}<div class="showcase-price">${money(product.price)}</div></div>${product.excludes_charms ? `<small class="card-charms-note">${t('excludesCharms')}</small>` : ''}</div></article>`; }).join('') || `<div class="empty">${t('noProducts')}</div>`}</div><button class="cart" onclick="showCart()">${t('bag')} · ${state.cart.reduce((count,item) => count + item.qty, 0)}</button>`;
  }

  const patchCategoryContent = () => {
    const currentProducts = document.querySelector('.products.product-showcase-list');
    const currentFilters = document.querySelector('.filters');
    const currentCount = document.querySelector('.section-head small');
    if (!currentProducts || !currentFilters || !currentCount || state.view !== 'shop') return false;
    const template = document.createElement('template');
    template.innerHTML = featuredCategoryShop();
    const nextProducts = template.content.querySelector('.products.product-showcase-list');
    const nextCount = template.content.querySelector('.section-head small');
    if (!nextProducts || !nextCount) return false;
    currentProducts.replaceWith(nextProducts);
    currentCount.textContent = nextCount.textContent;
    currentFilters.querySelectorAll('[data-category]').forEach(button => {
      button.classList.toggle('selected', button.dataset.category === state.category);
    });
    return true;
  };

  let scheduled = false;
  window.addEventListener('scroll', () => {
    if (scheduled || state.view !== 'shop') return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; remember(); });
  }, { passive: true });

  const baseSetCategory = setCategory;
  const baseShowProduct = showProduct;
  const baseGoBack = window.goBack || goBack;

  setCategory = (category) => {
    if (!validCategories.has(category)) return baseSetCategory(category);
    const scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    remember();
    state.category = category;
    // A direct category change preserves the current vertical position. It
    // patches only the count, selected button and product list instead of
    // remounting the whole shop. Browsers naturally clamp when the new list is
    // shorter, which is the only allowable position adjustment.
    if (!patchCategoryContent()) {
      state.restoreScroll = { scrollY, forms: {} };
      render();
      restorePosition(scrollY);
    }
  };

  showProduct = (id) => {
    remember();
    baseShowProduct(id);
  };

  goBack = () => {
    baseGoBack();
    if (state.view === 'shop') restore(state.category);
  };
  window.goBack = goBack;
  window.__cypressRestoreBack = goBack;

  // app.js and delivery-notes.js both install compatibility render functions in
  // earlier timers. Run after them, making Featured and the category state the
  // final storefront source of truth.
  setTimeout(() => {
    shop = featuredCategoryShop;
    if (state.view === 'shop') {
      render();
      restore(state.category);
    }
  }, 0);
})();
