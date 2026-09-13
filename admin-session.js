/* One admin-key check per browser session. All later admin requests use the HttpOnly session cookie. */
(function () {
  state.adminAuthenticated = false;

  adminFetch = async function (url, options = {}) {
    if (!state.adminAuthenticated) throw Error('Admin access required.');
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'Request failed');
    return response.status === 204 ? null : response.json();
  };

  const dashboard = () => `<section><div class="section-head"><h2>${t('adminTitle')}</h2><button class="back admin-home" onclick="showShop()">${t('backToHome')}</button></div><div class="admin-nav">${[['products','新增 / 编辑'],['inventory','商品管理'],['orders',t('orders')],['settings',t('settings')]].map(([tab,label]) => `<button class="${state.adminTab === tab ? 'selected' : ''}" onclick="adminTab('${tab}')">${label}</button>`).join('')}</div>${state.adminTab === 'products' ? productAdmin() : state.adminTab === 'inventory' ? productManagement() : state.adminTab === 'orders' ? ordersAdmin() : settingsAdmin()}</section>`;
  const accessPage = () => `<section class="admin-access panel"><div class="admin-access-card"><small>CYPR​ESS FASHION STORE</small><h2>Admin Access</h2><p>Enter your administrator key to continue.</p><label class="field"><b>Admin Key</b><div class="admin-key-input"><input id="admin-access-key" type="password" autocomplete="current-password" placeholder="••••••••" onkeydown="if(event.key==='Enter')confirmAdminAccess()"><button type="button" onclick="toggleAdminKeyVisibility()">Show</button></div></label><div id="admin-access-message" class="admin-access-message" aria-live="polite"></div><button class="primary" type="button" onclick="confirmAdminAccess()">Confirm</button></div></section>`;

  admin = function () { return state.adminAuthenticated ? dashboard() : accessPage(); };
  showAdmin = async function () {
    state.view = 'admin';
    if (state.adminAuthenticated) await loadAdmin();
    render();
  };
  adminTab = async function (tab) {
    if (!state.adminAuthenticated) { state.view = 'admin'; render(); return; }
    state.adminTab = tab;
    await loadAdmin();
    render();
  };
  toggleAdminKeyVisibility = function () {
    const field = document.querySelector('#admin-access-key');
    if (!field) return;
    field.type = field.type === 'password' ? 'text' : 'password';
    field.nextElementSibling.textContent = field.type === 'password' ? 'Show' : 'Hide';
  };
  confirmAdminAccess = async function () {
    const field = document.querySelector('#admin-access-key');
    const message = document.querySelector('#admin-access-message');
    const adminKey = field?.value.trim() || '';
    if (!adminKey) { if (message) message.textContent = 'Please enter the admin key.'; return; }
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ adminKey }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Incorrect admin key. Please try again.');
      state.adminAuthenticated = true;
      if (message) message.textContent = result.message || 'Access granted successfully.';
      await loadAdmin();
      render();
      showAdminSuccess?.('Access granted successfully.');
    } catch (error) { if (message) message.textContent = error.message || 'Incorrect admin key. Please try again.'; }
  };
  async function restoreAdminSession() {
    try {
      const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
      const result = await response.json();
      state.adminAuthenticated = result.authenticated === true;
      if (state.adminAuthenticated && state.view === 'admin') { await loadAdmin(); render(); }
    } catch { state.adminAuthenticated = false; }
  }
  restoreAdminSession();
})();
