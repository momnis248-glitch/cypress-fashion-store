// Telegram product links are an external entry point, so they always take
// priority over the remembered in-shop route for this webview session.
(() => {
  const productIdPattern = /^(?:product_|p_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const queryKeys = ['tgWebAppStartParam', 'startapp', 'product'];

  const request = () => {
    const query = new URLSearchParams(location.search);
    // Prefer the current URL. Telegram can reuse a Mini App webview, while
    // initDataUnsafe may still momentarily contain the previous start param.
    const fromUrl = queryKeys.map(key => query.get(key)).find(Boolean);
    const raw = String(fromUrl || window.Telegram?.WebApp?.initDataUnsafe?.start_param || '').trim();
    const match = productIdPattern.exec(raw);
    if (!match) return null;
    const entry = { id: match[1], signature: `product_${match[1]}` };
    // Telegram can retain its original start_param for the whole lifetime of a
    // reused Mini App. Once that exact entry has been dismissed or the shopper
    // opens a different card inside the store, it is stale—not a new request.
    // A different product signature remains a valid fresh Channel click.
    return !fromUrl && state.ignoredTelegramDeepLink === entry.signature ? null : entry;
  };

  const homeUrl = () => {
    const url = new URL(location.href);
    queryKeys.forEach(key => url.searchParams.delete(key));
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const productUrl = id => `${homeUrl()}${homeUrl().includes('?') ? '&' : '?'}product=${encodeURIComponent(id)}`;
  const fallbackHomeSnapshot = () => ({ view: 'shop', category: 'all', productId: null, scrollY: 0, forms: {}, selectedVariants: {} });

  const replaceWithHomeState = () => {
    try { history.replaceState({ ...(history.state || {}), cypressTelegramHome: true }, '', homeUrl()); } catch {}
  };
  const establishInternalHistory = id => {
    try {
      history.replaceState({ ...(history.state || {}), cypressTelegramHome: true }, '', homeUrl());
      history.pushState({ cypressTelegramProduct: true, cypressProduct: id }, '', productUrl(id));
    } catch {}
  };

  const finishAtHome = () => {
    const active = state.deepLinkSignature || state.deepLinkProductId || '';
    state.ignoredTelegramDeepLink = active;
    state.deepLinkEntry = false; state.deepLinkPending = false; state.deepLinkProductId = '';
    state.deepLinkSignature = ''; state.productBackTarget = ''; state.category = 'all';
    state.pageTrail = [];
    replaceWithHomeState();
    showShop();
  };

  window.returnFromTelegramProduct = () => {
    if (!state.deepLinkEntry && state.productBackTarget !== 'home') return false;
    finishAtHome();
    return true;
  };

  const openTelegramProduct = entry => {
    if (!entry) return false;
    const alreadyOpen = state.deepLinkEntry && state.deepLinkSignature === entry.signature && state.view === 'detail' && state.productId === entry.id;
    if (alreadyOpen) {
      if (state.products?.some(product => product.id === entry.id)) state.deepLinkPending = false;
      else if (Array.isArray(state.products) && state.products.length) state.deepLinkPending = false;
      return true;
    }
    // A new channel click must replace any remembered home/product state.
    if (state.ignoredTelegramDeepLink === entry.signature && state.view !== 'detail') return false;
    state.deepLinkApplied = true; state.deepLinkEntry = true; state.deepLinkPending = !state.products?.some(product => product.id === entry.id);
    state.deepLinkProductId = entry.id; state.deepLinkSignature = entry.signature; state.productBackTarget = 'home';
    state.productId = entry.id; state.category = 'all'; state.view = 'detail';
    // Make the Telegram BackButton an internal back action too. The product
    // handler still wins over this fallback snapshot when it resolves return.
    state.pageTrail = [fallbackHomeSnapshot()];
    establishInternalHistory(entry.id);
    render();
    window.Telegram?.WebApp?.BackButton?.show?.();
    return true;
  };

  window.applyTelegramProductLink = () => openTelegramProduct(request());

  // Telegram may resume an existing Mini App instance for another channel
  // click. Recheck on every useful resume signal, plus a light visible-only
  // polling fallback for clients that do not surface an explicit event.
  const checkForNewEntry = () => window.applyTelegramProductLink();
  window.addEventListener('focus', checkForNewEntry);
  window.addEventListener('pageshow', checkForNewEntry);
  window.addEventListener('visibilitychange', () => { if (!document.hidden) checkForNewEntry(); });
  window.addEventListener('hashchange', checkForNewEntry);
  window.addEventListener('popstate', event => {
    if (event.state?.cypressTelegramHome && (state.deepLinkEntry || state.productBackTarget === 'home')) finishAtHome();
    else if (event.state?.cypressTelegramProduct && event.state?.cypressProduct) openTelegramProduct({ id: event.state.cypressProduct, signature: `product_${event.state.cypressProduct}` });
  });
  window.Telegram?.WebApp?.onEvent?.('activated', checkForNewEntry);
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', checkForNewEntry);
  window.setInterval(() => { if (!document.hidden) checkForNewEntry(); }, 900);

  setTimeout(checkForNewEntry, 0);
})();
