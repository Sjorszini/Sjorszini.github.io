(function(){
  "use strict";
  var items=[
    {label:'Notation',selector:'.notation-card'},
    {label:'Input',selector:'.input-card'},
    {label:'Outputs',selector:'.output-card'},
    {label:'Calculate',selector:'.calculate-panel'},
    {label:'Results',selector:'#results',results:true}
  ];
  function el(id){return document.getElementById(id);}
  function target(item){return document.querySelector(item.selector);}
  function scrollToItem(item,button){var n=target(item);if(!n)return;n.scrollIntoView({behavior:'smooth',block:'start'});if(button)button.blur();}
  function setActive(index){var nav=el('finslerMobileFlow');if(!nav)return;Array.prototype.forEach.call(nav.querySelectorAll('button'),function(b,i){b.classList.toggle('is-active',i===index);if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
  function syncResults(){var nav=el('finslerMobileFlow'),results=el('results');if(!nav||!results)return;var b=nav.querySelector('button[data-index="4"]'),has=results.children.length>0;if(b){b.disabled=!has;b.setAttribute('aria-disabled',has?'false':'true');}}
  function init(){
    if(el('finslerMobileFlow'))return;
    var nav=document.createElement('nav');nav.id='finslerMobileFlow';nav.className='finsler-mobile-flow';nav.setAttribute('aria-label','Calculator workflow');
    items.forEach(function(item,i){var b=document.createElement('button');b.type='button';b.textContent=item.label;b.dataset.index=String(i);b.addEventListener('click',function(){if(!b.disabled)scrollToItem(item,b);});nav.appendChild(b);});
    document.body.appendChild(nav);document.body.classList.add('has-finsler-mobile-flow');
    var observed=[];items.forEach(function(item,i){var n=target(item);if(n)observed.push({node:n,index:i});});
    if('IntersectionObserver' in window){var observer=new IntersectionObserver(function(entries){var candidates=entries.filter(function(e){return e.isIntersecting;}).sort(function(a,b){return Math.abs(a.boundingClientRect.top)-Math.abs(b.boundingClientRect.top);});if(candidates.length){var found=observed.find(function(x){return x.node===candidates[0].target;});if(found)setActive(found.index);}}, {root:null,rootMargin:'-18% 0px -68% 0px',threshold:[0,0.01]});observed.forEach(function(x){observer.observe(x.node);});}
    var results=el('results');if(results)new MutationObserver(syncResults).observe(results,{childList:true});syncResults();
    var style=document.createElement('style');style.id='finsler-mobile-flow-styles';style.textContent='.finsler-mobile-flow{display:none}.notation-card,.input-card,.output-card,.calculate-panel,#results{scroll-margin-top:1rem}@media(max-width:760px){body.has-finsler-mobile-flow{padding-bottom:calc(4.7rem + env(safe-area-inset-bottom))}.finsler-mobile-flow{position:fixed;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));left:50%;bottom:calc(.55rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;width:min(94vw,520px);padding:.34rem;border:1px solid rgba(255,255,255,.12);border-radius:.9rem;background:rgba(3,11,20,.94);box-shadow:0 10px 30px rgba(0,0,0,.24);backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px)}.finsler-mobile-flow button{min-width:0;border:0;border-radius:.62rem;background:transparent;color:rgba(255,255,255,.72);padding:.58rem .2rem;font:inherit;font-size:.69rem;font-weight:650;line-height:1.1;cursor:pointer}.finsler-mobile-flow button.is-active{background:rgba(255,255,255,.12);color:#fff}.finsler-mobile-flow button:focus-visible{outline:2px solid #fff;outline-offset:1px}.finsler-mobile-flow button:disabled{opacity:.32;cursor:default}}';document.head.appendChild(style);
    window.FINSLER_MOBILE_FLOW_API={setActive:setActive,syncResults:syncResults};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();