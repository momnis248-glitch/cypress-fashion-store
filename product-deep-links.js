// Product-specific Telegram Mini App deep links.
function telegramProductLinkId(){
  const query=new URLSearchParams(location.search);
  const raw=String(window.Telegram?.WebApp?.initDataUnsafe?.start_param||query.get('tgWebAppStartParam')||query.get('startapp')||query.get('product')||'').trim();
  const match=/^(?:product_|p_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(raw);
  return match?match[1]:'';
}
function continueShoppingFromDeepLink(){
  if(typeof window.returnFromProduct==='function')return window.returnFromProduct();
  state.deepLinkProductId='';state.deepLinkEntry=false;state.productBackTarget='home';showShop();
}
function unavailableProductPage(){return `<section class="panel unavailable-product"><h2>This product is currently unavailable.</h2><p>该商品目前不可购买。您可以继续浏览商城中的其他商品。</p><button class="primary" onclick="continueShoppingFromDeepLink()">Continue Shopping / 继续逛商城</button></section>`}
window.applyTelegramProductLink=function applyTelegramProductLink(){
  const id=telegramProductLinkId();
  if(!id||state.deepLinkApplied)return;
  // A Telegram product link starts inside the Mini App, not inside the shop's
  // history. Keep an explicit internal fallback so our back UI never delegates
  // to Telegram / the browser history.
  state.deepLinkApplied=true;state.deepLinkProductId=id;state.deepLinkEntry=true;state.productBackTarget='home';state.productId=id;state.view='detail';
  try{history.replaceState({...history.state,cypressProduct:id},'',`${location.pathname}?product=${encodeURIComponent(id)}`)}catch{}
};

setTimeout(()=>{
  const baseProductDetail=productDetail,baseShowProduct=showProduct;
  productDetail=()=>{
    const product=state.products.find(item=>item.id===state.productId);
    if(!product&&state.deepLinkEntry)return unavailableProductPage();
    const html=String(baseProductDetail());
    return state.deepLinkEntry?html.replace(t('backToShop'),'← Continue Shopping'):html;
  };
  showProduct=id=>{state.deepLinkEntry=false;state.deepLinkProductId='';state.productBackTarget='';baseShowProduct(id)};
  // The first data response may have completed before this script loaded.
  window.applyTelegramProductLink();
  if(state.deepLinkEntry){state.view='detail';render();}
},0);
