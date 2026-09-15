(function(){
  "use strict";
  var allowCore=false,scheduled=false;
  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function key(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function add(tags,label){var k=key(label);if(k&&!tags.some(function(t){return t.key===k;}))tags.push({key:k,label:label});}
  function tagsFor(item){
    var tags=[],text=(item.title+' '+item.group+' '+item.description+' '+item.validation).toLowerCase();
    add(tags,item.dim+'D');
    if(item.status==='verified')add(tags,'verified');
    if(item.status==='structural')add(tags,'structural');
    if(/ric\s*=\s*0|vacuum/.test(text))add(tags,'Ricci-flat / vacuum');
    if(/riemann\s*=\s*0|flat spacetime|flat metric|minkowski/.test(text))add(tags,'flat');
    if(/constant curvature|round [23]-sphere|de sitter|anti-de sitter/.test(text))add(tags,'constant curvature');
    if(/black hole/.test(item.group.toLowerCase())||/schwarzschild|kerr|reissner|kottler|taub-nut|jnw/.test(item.title.toLowerCase()))add(tags,'black hole');
    if(/wave/.test(text))add(tags,'wave');
    if(/cosmolog|flrw|frw|de sitter/.test(text))add(tags,'cosmology');
    if(/spheric/.test(text))add(tags,'spherical');
    if(/stationary/.test(text))add(tags,'stationary');
    if(/static/.test(text))add(tags,'static');
    if(/axisym/.test(text))add(tags,'axisymmetric');
    if(/rotat/.test(text)||/kerr/.test(item.title.toLowerCase()))add(tags,'rotating');
    if(/finsler|randers|kropina|matsumoto|α|alpha-beta|alpha beta/.test(text))add(tags,'Finsler');
    if(/randers|kropina|matsumoto|α|alpha-beta|alpha beta/.test(text))add(tags,'α–β');
    if(/ansätze|ansatz|pre-solutions/.test(item.group.toLowerCase()))add(tags,'ansatz');
    return tags;
  }
  function itemMap(){var map={};(window.FINSLER_METRIC_CATALOGUE||[]).forEach(function(item){map[item.title]=item;});return map;}
  function decorate(){
    var map=itemMap();qa('.catalogue-card').forEach(function(card){
      var h=card.querySelector('h4'),item=h&&map[h.textContent.trim()];if(!item)return;
      card.dataset.finslerSearch=(item.title+' '+item.group+' '+item.description+' '+item.source+' '+item.validation+' '+tagsFor(item).map(function(t){return t.label;}).join(' ')).toLowerCase();
      card.dataset.finslerTags=tagsFor(item).map(function(t){return t.key;}).join(' ');
      var main=card.querySelector('.catalogue-card-main'),host=card.querySelector('.catalogue-math-tags');
      if(main&&!host){host=document.createElement('div');host.className='catalogue-math-tags';host.setAttribute('aria-label','Mathematical tags');tagsFor(item).forEach(function(t){var s=document.createElement('span');s.textContent=t.label;host.appendChild(s);});main.appendChild(host);}
    });
  }
  function applyFilter(){
    decorate();var q=(el('catalogueSearch')?el('catalogueSearch').value:'').trim().toLowerCase(),tag=el('catalogueTagFilter')?el('catalogueTagFilter').value:'',cards=qa('.catalogue-card'),visible=0;
    cards.forEach(function(card){var ok=(!q||String(card.dataset.finslerSearch||'').indexOf(q)!==-1)&&(!tag||(' '+String(card.dataset.finslerTags||'')+' ').indexOf(' '+tag+' ')!==-1);card.hidden=!ok;if(ok)visible++;});
    var count=el('catalogueCount');if(count)count.textContent=visible+' of '+cards.length+' entries'+(q||tag?' match':'');
    var grid=el('catalogueGrid'),empty=grid&&grid.querySelector('.finsler-catalogue-filter-empty');
    if(grid&&!empty){empty=document.createElement('div');empty.className='catalogue-empty finsler-catalogue-filter-empty';empty.textContent='No entries match the current search and mathematical tag.';empty.hidden=true;grid.appendChild(empty);}
    if(empty)empty.hidden=visible!==0;
  }
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(function(){scheduled=false;applyFilter();},0);}
  function forceCoreRenderAll(){
    var search=el('catalogueSearch');if(!search)return;var q=search.value;allowCore=true;search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));search.value=q;allowCore=false;schedule();
  }
  function installFilter(){
    var controls=document.querySelector('.catalogue-controls');if(!controls||el('catalogueTagFilter'))return;
    var select=document.createElement('select');select.id='catalogueTagFilter';select.setAttribute('aria-label','Filter catalogue by mathematical tag');
    var all=[{key:'',label:'All math tags'}],seen={};(window.FINSLER_METRIC_CATALOGUE||[]).forEach(function(item){tagsFor(item).forEach(function(t){if(!seen[t.key]){seen[t.key]=1;all.push(t);}});});
    all.sort(function(a,b){if(!a.key)return -1;if(!b.key)return 1;return a.label.localeCompare(b.label);});
    all.forEach(function(t){var o=document.createElement('option');o.value=t.key;o.textContent=t.label;select.appendChild(o);});
    select.addEventListener('change',applyFilter);controls.appendChild(select);
  }
  function init(){
    installFilter();
    document.addEventListener('input',function(e){if(e.target===el('catalogueSearch')&&!allowCore){e.stopImmediatePropagation();forceCoreRenderAll();}},true);
    document.addEventListener('change',function(e){if(e.target===el('catalogueGroup')&&!allowCore){e.stopImmediatePropagation();forceCoreRenderAll();}},true);
    var grid=el('catalogueGrid');if(grid)new MutationObserver(schedule).observe(grid,{childList:true,subtree:true});
    var style=document.createElement('style');style.id='finsler-catalogue-tag-styles';style.textContent='.catalogue-math-tags{display:flex;gap:.32rem;flex-wrap:wrap;margin-top:.55rem}.catalogue-math-tags span{font-size:.68rem;line-height:1.2;padding:.2rem .4rem;border-radius:999px;background:rgba(67,76,94,.075);color:#596273;border:1px solid rgba(67,76,94,.09)}.catalogue-card[hidden]{display:none!important}.catalogue-controls #catalogueTagFilter{min-width:9rem}';document.head.appendChild(style);
    forceCoreRenderAll();window.FINSLER_CATALOGUE_TAG_API={tagsFor:tagsFor,applyFilter:applyFilter};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();