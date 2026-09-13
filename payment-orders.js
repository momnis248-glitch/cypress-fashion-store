/* Payment-proof orders: runs after the existing storefront scripts. */
(function () {
  const statusLabels = {
    awaiting_payment: { en: 'Pending payment', km: 'រង់ចាំការបង់ប្រាក់' },
    payment_proof_uploaded: { en: 'Waiting for payment confirmation', km: 'រង់ចាំការបញ្ជាក់ការបង់ប្រាក់' },
    payment_rejected: { en: 'Payment rejected', km: 'ការបង់ប្រាក់មិនត្រូវបានអនុម័ត' },
    paid: { en: 'Paid', km: 'បានបង់ប្រាក់' },
    processing: { en: 'Processing', km: 'កំពុងរៀបចំទំនិញ' },
    shipping: { en: 'Shipped', km: 'បានដឹកចេញ' },
    ready_for_pickup: { en: 'Ready for pickup', km: 'រួចរាល់សម្រាប់មកយក' },
    completed: { en: 'Completed', km: 'បានបញ្ចប់' },
    cancelled: { en: 'Cancelled', km: 'បានលុបចោល' }
  };
  const label = status => (statusLabels[status] || { en: status, km: status })[state.language === 'km' ? 'km' : 'en'];
  const html = value => String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const orderItems = order => (order.items || []).map(item => `<li><b>${html(item.quantity)} × ${html(item.name)}</b>${item.color ? ` · ${html(colorName(item.color))}` : ''}${item.size ? ` · ${html(item.size)}` : ''}<small>${item.sale_type === 'in_stock' ? 'IN STOCK / 现货' : 'PRE-ORDER / 预售'} · ${money(item.price)}</small></li>`).join('');
  const existingCheckout = checkout;
  checkout = function (subtotal) {
    return existingCheckout(subtotal).replace(`>${t('requestQR')}</button>`, `>${state.language === 'km' ? 'បញ្ជាក់ការបង់ប្រាក់' : 'Confirm Payment'}</button>`);
  };

  requestQR = async function () {
    const name = $('#customer-name')?.value.trim();
    const contact = $('#customer-contact')?.value.trim();
    const address = $('#customer-address')?.value.trim();
    if (!name || !contact || (state.delivery === 'delivery' && !address)) {
      alert(state.language === 'km' ? 'សូមបំពេញព័ត៌មានបញ្ជាទិញ។' : 'Please complete the order details.');
      return;
    }
    const items = state.cart.map(cartItem => {
      const product = state.products.find(item => item.id === cartItem.id);
      return product && { id: product.id, size: cartItem.size || '', color: cartItem.color || '', quantity: cartItem.qty };
    }).filter(Boolean);
    if (!items.length) return;
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telegramInitData: window.Telegram?.WebApp?.initData || '', name, contact, address, delivery: state.delivery, region: state.region, items })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Could not create order.');
      state.cart = []; save();
      alert(state.language === 'km' ? `បានបង្កើតការបញ្ជាទិញ ${result.order_number}។ សូមពិនិត្យ Telegram សម្រាប់ QR បង់ប្រាក់។` : `Order ${result.order_number} was created. Check Telegram for the payment QR.`);
      showShop();
    } catch (error) { alert(error.message || t('serverError')); }
  };

  myOrdersPage = function () {
    const orders = Array.isArray(state.myOrders) ? state.myOrders : [];
    if (state.myOrdersLoading) return `<section class="panel"><button class="back home-return" onclick="showShop()">${t('backToHome')}</button><h2>${t('orderHistory')}</h2><div class="empty">Loading…</div></section>`;
    if (state.myOrdersError) return `<section class="panel"><button class="back home-return" onclick="showShop()">${t('backToHome')}</button><h2>${t('orderHistory')}</h2><div class="empty">${html(state.myOrdersError)}</div></section>`;
    return `<section class="panel customer-orders"><button class="back home-return" onclick="showShop()">${t('backToHome')}</button><h2>${t('orderHistory')}</h2>${orders.length ? orders.map(order => `<article class="customer-order"><div><b>${html(order.order_number)}</b><br><small>${new Date(order.created_at).toLocaleString()}</small></div><span class="order-status status-${html(order.status)}">${label(order.status)}</span><div class="customer-order-items">${orderItems(order)}</div><strong>${money(order.total)}</strong>${['awaiting_payment','payment_rejected'].includes(order.status) ? `<button class="danger customer-order-delete" onclick="deleteMyOrder('${order.id}')">${t('delete')}</button>` : ''}</article>`).join('') : `<div class="empty">${t('noOrders')}</div>`}</section>`;
  };

  function orderDetail(order) {
    const proof = order.payment_proof_file_id ? `<div class="payment-proof"><b>付款凭证 / Payment proof</b><div id="payment-proof-image" class="proof-loading">Loading payment proof…</div><small>Uploaded: ${new Date(order.payment_proof_at).toLocaleString()}</small></div>` : `<div class="payment-proof empty">尚未上传付款凭证 / No payment proof uploaded.</div>`;
    const actions = order.status === 'payment_proof_uploaded'
      ? `<button class="primary" onclick="confirmOrderPayment('${order.id}')">确认收款 / Confirm payment</button><button class="danger" onclick="rejectOrderPayment('${order.id}')">付款未通过 / Reject payment</button>`
      : '';
    const fulfilment = ['paid','processing','shipping','ready_for_pickup'].includes(order.status)
      ? `<label class="field"><b>订单后续状态</b><select onchange="updateOrderFulfilment('${order.id}',this.value)">${[['paid','已付款'],['processing','处理中'],['shipping','已发货'],['ready_for_pickup','可自提'],['completed','已完成']].map(([value,text]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>` : '';
    return `<section class="panel payment-order-detail"><button class="back" onclick="closeOrderDetail()">← 返回 Orders</button><div class="order-detail-head"><div><small>Order</small><h2>${html(order.order_number)}</h2></div><span class="order-status status-${html(order.status)}">${label(order.status)}</span></div><div class="order-detail-grid"><div><b>顾客 / Customer</b><p>${html(order.customer_name)}<br>${html(order.contact)}<br>Telegram: ${html(order.telegram_user_id)}</p></div><div><b>配送 / Delivery</b><p>${order.delivery === 'pickup' ? 'Self-pickup / 自提' : 'Delivery / 快递'}${order.region ? `<br>${html(order.region)}` : ''}<br>${html(order.address || '—')}</p></div><div><b>金额 / Total</b><p>Products ${money(order.subtotal)}<br>Shipping ${money(order.shipping)}<br><strong>${money(order.total)}</strong></p></div><div><b>下单时间 / Created</b><p>${new Date(order.created_at).toLocaleString()}${order.payment_confirmed_at ? `<br>Confirmed: ${new Date(order.payment_confirmed_at).toLocaleString()}` : ''}</p></div></div><div class="order-line-items"><b>商品 / Items</b><ul>${orderItems(order)}</ul></div>${proof}<div class="payment-actions">${actions}${fulfilment}<button class="secondary" onclick="cancelAdminOrder('${order.id}')" ${['cancelled','completed'].includes(order.status) ? 'disabled' : ''}>取消订单 / Cancel order</button><button class="danger" onclick="deletePaymentOrder('${order.id}')">永久删除订单</button></div></section>`;
  }

  paymentOrdersAdmin = function () {
    const detail = (state.orders || []).find(order => order.id === state.paymentOrderId);
    if (detail) return orderDetail(detail);
    const orders = state.orders || [];
    return `<section class="panel payment-orders"><div class="section-head"><h2>Orders</h2><div class="order-list-tools"><small>${orders.length} orders</small><button class="back" onclick="refreshPaymentOrders()">刷新订单</button></div></div><div class="payment-order-list">${orders.map(order => `<article class="payment-order-row"><div><b>${html(order.order_number)}</b><small>${new Date(order.created_at).toLocaleString()}</small><span>${html(order.customer_name)} · ${html(order.contact)}</span></div><div><strong>${money(order.total)}</strong><span class="order-status status-${html(order.status)}">${label(order.status)}</span>${order.payment_proof_file_id ? '<small class="proof-flag">付款凭证已上传</small>' : ''}</div><button onclick="openOrderDetail('${order.id}')">查看详情</button></article>`).join('') || '<div class="empty">暂无订单。</div>'}</div></section>`;
  };

  openOrderDetail = async function (id) { state.paymentOrderId = id; render(); const order = (state.orders || []).find(item => item.id === id); if (order?.payment_proof_file_id) setTimeout(() => loadPaymentProof(id), 0); };
  closeOrderDetail = function () { state.paymentOrderId = null; render(); };
  refreshPaymentOrders = async function () { try { await loadAdmin(); render(); } catch (error) { alert(error.message); } };
  async function reloadOrders() { await loadAdmin(); render(); const order = (state.orders || []).find(item => item.id === state.paymentOrderId); if (order?.payment_proof_file_id) setTimeout(() => loadPaymentProof(order.id), 0); }
  confirmOrderPayment = async function (id) { if (!confirm('确认已收到付款？库存和销量将在此刻正式生效。')) return; try { await adminFetch(`/api/admin/orders/${id}/confirm-payment`, { method: 'POST', body: '{}' }); await reloadOrders(); } catch (error) { alert(error.message); } };
  rejectOrderPayment = async function (id) { if (!confirm('拒绝这份付款凭证，并通知顾客重新上传？')) return; try { await adminFetch(`/api/admin/orders/${id}/reject-payment`, { method: 'POST', body: '{}' }); await reloadOrders(); } catch (error) { alert(error.message); } };
  updateOrderFulfilment = async function (id, status) { try { await adminFetch(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reloadOrders(); } catch (error) { alert(error.message); } };
  cancelAdminOrder = async function (id) { if (!confirm('取消订单？已确认的现货库存会自动恢复。')) return; try { await adminFetch(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }); await reloadOrders(); } catch (error) { alert(error.message); } };
  deletePaymentOrder = async function (id) { if (!confirm('永久删除这个订单？此操作无法恢复；已确认的现货库存会先自动恢复。')) return; try { await adminFetch(`/api/admin/orders/${id}`, { method: 'DELETE' }); state.paymentOrderId = null; await loadAdmin(); render(); } catch (error) { alert(error.message); } };
  async function loadPaymentProof(id) {
    const target = document.querySelector('#payment-proof-image'); if (!target) return;
    try {
      const response = await fetch(`/api/admin/orders/${id}/payment-proof`, { headers: { 'x-admin-key': key() } });
      if (!response.ok) throw Error('Could not load payment proof.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      target.innerHTML = `<img src="${url}" alt="Payment proof">`;
    } catch (error) { target.textContent = error.message; }
  }

  ordersAdmin = paymentOrdersAdmin;
  managedOrders = paymentOrdersAdmin;
})();
