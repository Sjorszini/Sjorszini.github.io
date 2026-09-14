(function(){
  "use strict";

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;"); }

  function groups(items){
    var seen=Object.create(null), out=[];
    items.forEach(function(item){ if(!seen[item.group]){ seen[item.group]=true; out.push(item.group); } });
    return out;
  }

  function expandDefinitions(expr, defs){
    var text=String(expr), names=Object.keys(defs||{});
    if(!names.length || !window.math) return text;
    for(var pass=0; pass<8; pass++){
      var changed=false;
      var node=math.parse(text).transform(function(child){
        if(child && child.isSymbolNode && Object.prototype.hasOwnProperty.call(defs, child.name)){
          changed=true;
          return math.parse("("+defs[child.name]+")");
        }
        return child;
      });
      text=node.toString({parenthesis:"auto"});
      if(!changed) break;
    }
    return text;
  }

  function setRadio(name,value){
    var n=document.querySelector('input[name="'+name+'"][value="'+value+'"]');
    if(n){ n.checked=true; n.dispatchEvent(new Event("change",{bubbles:true})); }
  }

  function translateToInternal(expr, coords){
    if(!window.math) return expr;
    var map=Object.create(null);
    coords.forEach(function(name,i){ map[name]="x"+(i+1); });
    return math.parse(String(expr)).transform(function(child){
      if(child && child.isSymbolNode && map[child.name]) return math.parse(map[child.name]);
      return child;
    }).toString({parenthesis:"auto"});
  }

  function setCoordinates(coords){
    var fields=document.querySelectorAll(".custom-coordinate-input");
    if(fields.length===coords.length){
      fields.forEach(function(field,i){ field.value=coords[i]; field.dispatchEvent(new Event("input",{bubbles:true})); });
      return true;
    }
    return false;
  }

  function setMetric(matrix, entry){
    var hasCustomCoords=setCoordinates(entry.coords);
    var defs=entry.definitions||{};
    for(var i=0;i<matrix.length;i++) for(var j=0;j<matrix.length;j++){
      var cell=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');
      if(!cell) continue;
      var expr=expandDefinitions(matrix[i][j],defs);
      if(!hasCustomCoords) expr=translateToInternal(expr,entry.coords);
      cell.value=expr;
    }
  }

  function loadEntry(entry){
    var clear=el("clearResults"); if(clear) clear.click();
    var dim=el("dimension");
    if(!dim) return;
    dim.value=String(entry.dim);
    dim.dispatchEvent(new Event("change",{bubbles:true}));
    setRadio("inputMode","metric");
    setRadio("geometryMode","riemannian");
    setTimeout(function(){
      setMetric(entry.matrix,entry);
      setCoordinates(entry.coords);
      var note=el("exampleNote");
      if(note) note.textContent=entry.title+" · "+entry.source+" · reference check: "+entry.validation+".";
      var drawer=el("metricCatalogueDrawer"); if(drawer) drawer.open=false;
    },20);
  }

  function render(){
    var host=el("catalogueGrid"), search=el("catalogueSearch"), filter=el("catalogueGroup"), count=el("catalogueCount");
    if(!host || !search || !filter || !count) return;
    var items=window.FINSLER_METRIC_CATALOGUE;
    if(!Array.isArray(items) || !items.length){
      count.textContent="Catalogue failed to load";
      host.innerHTML='<div class="catalogue-empty">The metric catalogue data could not be loaded. Reload this exact test version; if this persists, the page has a script-loading error.</div>';
      return;
    }

    if(!filter.dataset.catalogueReady){
      filter.innerHTML='<option value="">All groups</option>'+groups(items).map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("");
      filter.dataset.catalogueReady="1";
      search.addEventListener("input",render);
      filter.addEventListener("change",render);
    }

    var q=search.value.trim().toLowerCase(), group=filter.value;
    var shown=items.filter(function(item){
      var hay=(item.title+" "+item.group+" "+item.description+" "+item.source).toLowerCase();
      return (!group || item.group===group) && (!q || hay.indexOf(q)!==-1);
    });
    count.textContent=shown.length+" of "+items.length+" entries";
    host.innerHTML="";
    if(!shown.length){ host.innerHTML='<div class="catalogue-empty">No matching metrics.</div>'; return; }

    shown.forEach(function(item){
      var card=document.createElement("article");
      card.className="catalogue-card";
      card.innerHTML='<div class="catalogue-card-main"><div class="catalogue-card-top"><h4>'+esc(item.title)+'</h4><span class="catalogue-group">'+esc(item.group)+'</span></div><p>'+esc(item.description)+'</p><div class="catalogue-meta"><span class="catalogue-chip">'+esc(item.source)+'</span><span class="catalogue-chip">'+esc(item.coords.join(", "))+'</span><span class="catalogue-chip is-verified">'+esc(item.validation)+'</span></div></div><button type="button" class="catalogue-load">Load</button>';
      card.querySelector("button").addEventListener("click",function(){ loadEntry(item); });
      host.appendChild(card);
    });
  }

  function init(){
    render();
    var drawer=el("metricCatalogueDrawer");
    if(drawer) drawer.addEventListener("toggle",function(){ if(drawer.open) render(); });
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();