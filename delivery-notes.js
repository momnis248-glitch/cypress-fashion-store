// Compact, bilingual delivery notes for product pages and the admin editor.
const DELIVERY_NOTE_DEFAULTS={
  en:'Pre-order: Delivery in 15–18 days after placing the order.\nIn Stock – Delivery: Delivery in 3–4 days.\nSelf-Pickup: Available after work the next day.\nPickup Location: Security Room at T20 Factory.',
  km:'ទំនិញបញ្ជាទិញមុន (Pre-order): ទទួលបានទំនិញក្នុងរយៈពេល 15–18 ថ្ងៃ បន្ទាប់ពីធ្វើការបញ្ជាទិញ។\nទំនិញមានស្តុក – ដឹកជញ្ជូន: ទទួលបានទំនិញក្នុងរយៈពេល 3–4 ថ្ងៃ។\nមកយកដោយខ្លួនឯង: អាចមកយកបានបន្ទាប់ពីចេញពីធ្វើការនៅថ្ងៃបន្ទាប់។\nទីតាំងមកយក: បន្ទប់សន្តិសុខនៅរោងចក្រ T20។'
};
defaults.default_delivery_notes=defaults.default_delivery_notes||DELIVERY_NOTE_DEFAULTS;
state.settings.default_delivery_notes=state.settings.default_delivery_notes||defaults.default_delivery_notes;

function noteText(notes,language){return String(notes?.[language]||'').trim()}
function productDeliveryNotes(product){const custom=product?.delivery_notes||{},globalNotes=state.settings?.default_delivery_notes||DELIVERY_NOTE_DEFAULTS;return noteText(custom,'en')||noteText(custom,'km')?{en:noteText(custom,'en'),km:noteText(custom,'km')}:globalNotes}
function deliveryNoteMarkup(product){
  const notes=productDeliveryNotes(product),language=state.language==='km'?'km':'en',lines=noteText(notes,language).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const title=language==='km'?'ព័ត៌មានដឹកជញ្ជូន':'Delivery information';
  const emphasis=language==='km'?[/15–18 ថ្ងៃ/g,/3–4 ថ្ងៃ/g,/ថ្ងៃបន្ទាប់/g,/រោងចក្រ T20/g]:[/15–18 days/g,/3–4 days/g,/next day/g,/T20 Factory/g];
  const format=line=>emphasis.reduce((html,pattern)=>html.replace(pattern,match=>`<strong>${match}</strong>`),line);
  return `<section class="delivery-notes"><b>${title}</b><div>${lines.map(line=>`<p>${format(line)}</p>`).join('')}</div></section>`;
}
function deliveryNotesAdminFields(product){
  const custom=product?.delivery_notes||{},isCustom=Boolean(noteText(custom,'en')||noteText(custom,'km')),fallback=state.settings?.default_delivery_notes||DELIVERY_NOTE_DEFAULTS;
  return `<fieldset class="delivery-notes-admin"><legend>配送说明 / Delivery notes</legend><label class="admin-choice"><input type="checkbox" name="use_custom_delivery_notes" ${isCustom?'checked':''} onchange="toggleCustomDeliveryNotes(this)"><span>为此商品单独设置配送说明</span></label><div id="custom-delivery-notes" ${isCustom?'':'hidden'}><label class="field">English<textarea name="delivery_notes_en">${noteText(custom,'en')||noteText(fallback,'en')}</textarea></label><label class="field">ខ្មែរ<textarea name="delivery_notes_km">${noteText(custom,'km')||noteText(fallback,'km')}</textarea></label></div><small>未勾选时，此商品自动使用下方的全局默认配送说明。</small></fieldset>`;
}
function toggleCustomDeliveryNotes(input){const box=document.querySelector('#custom-delivery-notes');if(box)box.hidden=!input.checked}

function deliveryProductDetail(){
  const p=state.products.find(x=>x.id===state.productId);if(!p){showShop();return ''}
  const size=selectedOption(p.id,'size'),color=selectedOption(p.id,'color'),type=variantType(p,size,color),blocked=type==='in_stock'&&variantStock(p,size,color)<1,detail=p.detail_image_url||p.image_url,note=p.excludes_charms?`<p class="bag-charms-note">${t('excludesCharms')}</p>`:'';
  return `<section class="panel product-detail"><button class="back" onclick="goBack()">${t('backToShop')}</button><div class="detail-info">${variantSaleBadge(type)}<span class="category-label">${t(p.category)}</span><h2>${productName(p)}</h2><div class="detail-price">${money(p.price)}</div>${note}${deliveryNoteMarkup(p)}${stockAwarePicker(p)}<button class="add" ${blocked?'disabled':''} onclick="add('${p.id}')">${blocked?'SOLD OUT / អស់ស្តុក':t('add')}</button></div><div class="long-detail-image"><img src="${detail}" alt="${p.name_en}"></div></section>`;
}

async function saveDeliveryProduct(event){
  event.preventDefault();
  const form=event.currentTarget,editing=state.editId?state.products.find(p=>p.id===state.editId):null,main=form.main_photo.files[0],detail=form.detail_photo.files[0];
  if(!editing&&(!main||!detail)){alert('Choose both photos.');return}
  const input=Object.fromEntries(new FormData(form));
  input.sizes=[...form.querySelectorAll('input[name="sizes"]:checked')].map(x=>x.value);
  input.size_guides={};form.querySelectorAll('[data-guide-size]').forEach(x=>{const size=x.dataset.guideSize;(input.size_guides[size]??={})[x.dataset.guideField]=x.value.trim()});
  input.color_images=editing?.color_images||{};input.colorImageData={};
  await Promise.all([...form.querySelectorAll('[data-color-photo]')].map(async x=>{if(x.files[0])input.colorImageData[x.dataset.colorPhoto]=await toData(x.files[0])}));
  input.colors=COLOR_OPTIONS.filter(color=>input.color_images[color.value]||input.colorImageData[color.value]).map(color=>color.value);
  input.variant_sale_types={};input.stock_by_sku=Object.fromEntries([...form.querySelectorAll('[data-stock-sku]')].map(x=>[x.dataset.stockSku,Math.max(0,Math.floor(Number(x.value)||0))]));
  const sizes=input.sizes.length?input.sizes:[''];form.querySelectorAll('[data-variant-type]').forEach(select=>{const color=select.dataset.variantType;if(input.colors.includes(color))sizes.forEach(size=>input.variant_sale_types[stockKey(size,color)]=select.value)});
  if(!input.colors.length)input.variant_sale_types.default='preorder';
  input.sale_type=Object.values(input.variant_sale_types).includes('in_stock')?'in_stock':'preorder';
  input.delivery_notes=form.use_custom_delivery_notes?.checked?{en:form.delivery_notes_en.value.trim(),km:form.delivery_notes_km.value.trim()}:{};
  input.excludes_charms=Boolean(form.excludes_charms?.checked);input.mainImageData=main?await toData(main):'';input.detailImageData=detail?await toData(detail):'';input.published=form.published.checked;input.featured=form.featured.checked;
  if(editing){input.image_url=editing.image_url;input.detail_image_url=editing.detail_image_url||''}
  try{await adminFetch(editing?`/api/admin/products/${editing.id}`:'/api/admin/products',{method:editing?'PATCH':'POST',body:JSON.stringify(input)});state.editId=null;await loadAdmin();render();showAdminSuccess('商品和配送说明已保存 ✓')}catch(error){alert(error.message)}
}

async function saveDeliverySettings(event){
  event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
  data.shipping={};Object.keys(state.settings.shipping||{}).forEach(region=>{data.shipping[region]='$'+Number(data[`fee-${region}`]||0).toFixed(2);delete data[`fee-${region}`]});
  data.default_delivery_notes={en:form.default_delivery_notes_en.value.trim(),km:form.default_delivery_notes_km.value.trim()};
  delete data.default_delivery_notes_en;delete data.default_delivery_notes_km;
  try{const saved=await adminFetch('/api/admin/settings',{method:'PUT',body:JSON.stringify(data)});state.settings=saved||data;render();showAdminSuccess('默认配送说明已保存 ✓')}catch(error){alert(error.message)}
}

function charmAwareShop(){
  const list=state.category==='all'?state.products:state.products.filter(p=>p.category===state.category),hero=state.language==='km'?state.settings.hero_km:state.settings.hero_en,heroText=state.language==='km'?state.settings.hero_text_km:state.settings.hero_text_en;
  return `<section class="hero"><div class="hero-main"><div class="eyebrow">${t('heroTag')}</div><h1>${hero}</h1><p>${heroText}</p></div><div class="hero-side"><strong>${newArrivalText()}</strong></div></section>${customerActions()}${typeof channelButton==='function'?channelButton():''}<div class="section-head"><h2>${t('featured')}</h2><small>${list.length} ${t('items')}</small></div><div class="filters">${['all','clothes','bags','charms'].map(x=>`<button class="filter ${state.category===x?'selected':''}" onclick="setCategory('${x}')">${t(x)}</button>`).join('')}</div><div class="products product-showcase-list">${list.map(p=>{const sold=productSoldOut(p),type=productCardType(p),name=productName(p);return `<article class="product product-showcase ${sold?'sold-out-card':''}"><button class="product-image product-image-button" onclick="showProduct('${p.id}')">${image(p)}${sold?'<span class="sold-out-overlay">SOLD OUT<br>អស់ស្តុក</span>':''}</button><div class="showcase-info showcase-info-aligned"><h3 class="showcase-name ${name.length>20?'two-lines':''}"><button class="title-button" onclick="showProduct('${p.id}')">${name}</button></h3><div class="showcase-bottom">${variantSaleBadge(type)}<div class="showcase-price">${money(p.price)}</div></div>${p.excludes_charms?`<small class="card-charms-note">${t('excludesCharms')}</small>`:''}</div></article>`}).join('')||`<div class="empty">${t('noProducts')}</div>`}</div><button class="cart" onclick="showCart()">${t('bag')} · ${state.cart.reduce((n,x)=>n+x.qty,0)}</button>`;
}

setTimeout(()=>{
  const baseProductAdmin=variantProductAdmin,baseSettingsAdmin=settingsAdmin;
  productAdmin=()=>baseProductAdmin()
    .replace(/<label class="field">[^<]*<textarea name="description_(?:en|km)"[^>]*>[\s\S]*?<\/textarea><\/label>/g,'')
    .replace(/(<label id="bag-charms-field"[^>]*?)\s+hidden(>)/,'$1$2')
    .replace(/(<label class="field">[^<]*<input name="main_photo")/,`${deliveryNotesAdminFields(state.editId?state.products.find(p=>p.id===state.editId):null)}$1`);
  const previousToggleSizeField=toggleSizeField;
  toggleSizeField=category=>{previousToggleSizeField(category);const field=document.querySelector('#bag-charms-field');if(field)field.hidden=false};
  settingsAdmin=()=>baseSettingsAdmin().replace('<button class="primary">',`<fieldset class="delivery-notes-admin default-delivery-notes"><legend>默认配送说明 / Default delivery notes</legend><label class="field">English<textarea name="default_delivery_notes_en">${noteText(state.settings.default_delivery_notes||DELIVERY_NOTE_DEFAULTS,'en')}</textarea></label><label class="field">ខ្មែរ<textarea name="default_delivery_notes_km">${noteText(state.settings.default_delivery_notes||DELIVERY_NOTE_DEFAULTS,'km')}</textarea></label><small>新商品和未自定义配送说明的现有商品都会使用这里的内容。</small></fieldset><button class="primary">`);
  productDetail=deliveryProductDetail;
  shop=charmAwareShop;
  saveProduct=saveDeliveryProduct;
  saveSettings=saveDeliverySettings;
},0);
