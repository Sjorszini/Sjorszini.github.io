(function(){
  "use strict";

  var NativeWorker=window.Worker;
  if(!NativeWorker || NativeWorker.__finslerEnhanced) return;

  var activeCatalogueEntry=null;
  var coordinateNames=[];
  var KNOWN_FUNCTIONS={sqrt:1,exp:1,sin:1,cos:1,tan:1,sinh:1,cosh:1,tanh:1,log:1,ln:1,abs:1,asin:1,acos:1,atan:1,atan2:1,min:1,max:1,sign:1};
  var SECTION_KEYS={metric:"metric",inverse:"inverse",cartan:"cartan",spray:"spray",nonlinear:"nonlinear",christoffel:"connections",berwald:"connections",chern:"connections",curvature:"curvature",deviation:"deviation",ricci:"ricci",affineCurvature:"affine",affineRicci:"affine"};

  function el(id){return document.getElementById(id);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function fmt(ms){if(ms<1000)return ms.toFixed(0)+" ms";if(ms<60000)return(ms/1000).toFixed(ms<10000?2:1)+" s";return Math.floor(ms/60000)+"m "+((ms%60000)/1000).toFixed(1)+"s";}
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function regexEscape(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function outputKey(section){return SECTION_KEYS[section]||section;}
  function logTiming(label,ms,suffix){
    var log=el("timing-log"); if(!log||!label)return;
    var row=document.createElement("div");row.className="timing-row timing-row-internal";
    row.textContent=label+" · "+fmt(ms)+(suffix?" · "+suffix:"");log.appendChild(row);
  }

  function loadAssets(){
    if(!document.querySelector('link[href^="finsler-catalogue-v2.css"]')){
      var link=document.createElement("link");link.rel="stylesheet";link.href="finsler-catalogue-v2.css?v=1";document.head.appendChild(link);
    }
    if(!window.FINSLER_METRIC_CATALOGUE && !document.querySelector('script[src^="finsler-metric-catalogue.js"]')){
      var s=document.createElement("script");s.src="finsler-metric-catalogue.js?v=1";s.onload=renderCatalogue;document.head.appendChild(s);
    }
  }
  loadAssets();

  function dimension(){var n=el("dimension");return n?Number(n.value):4;}
  function defaultCoords(n){var out=[];for(var i=1;i<=n;i++)out.push("x"+i);return out;}
  function parseAsSymbol(name){
    try{var node=math.parse(name);return !!(node&&node.isSymbolNode&&node.name===name);}catch(e){return false;}
  }
  function validateCoords(names){
    var seen=Object.create(null);
    for(var i=0;i<names.length;i++){
      var name=String(names[i]||"").trim();
      if(!name)throw new Error("Coordinate "+(i+1)+" is empty.");
      if(!parseAsSymbol(name))throw new Error("‘"+name+"’ is not a valid symbolic coordinate name.");
      if(seen[name])throw new Error("Coordinate names must be unique; ‘"+name+"’ is repeated.");
      seen[name]=true;
    }
    return names.map(function(x){return String(x).trim();});
  }
  function currentCoords(){
    var inputs=qa(".custom-coordinate-input",el("coordinateFields"));
    if(!inputs.length)return defaultCoords(dimension());
    return validateCoords(inputs.map(function(n){return n.value;}));
  }
  function renderCoordinateFields(names){
    var n=dimension(),host=el("coordinateFields");if(!host)return;
    var old=names||coordinateNames||[],out=[];host.innerHTML="";
    for(var i=0;i<n;i++){
      var name=old[i]||("x"+(i+1));out.push(name);
      var label=document.createElement("label");label.className="coordinate-field";
      label.innerHTML='<span>x<sup>'+(i+1)+'</sup></span><input class="custom-coordinate-input" data-index="'+i+'" value="'+esc(name)+'" aria-label="Coordinate '+(i+1)+'">';
      host.appendChild(label);
    }
    coordinateNames=out;updateCoordinatePresentation();
    qa(".custom-coordinate-input",host).forEach(function(inp){inp.addEventListener("input",function(){
      coordinateNames=qa(".custom-coordinate-input",host).map(function(n){return n.value.trim();});updateCoordinatePresentation();
    });});
  }
  function updateCoordinatePresentation(){
    var names=coordinateNames.slice(0,dimension());
    var aliases=el("coordinateAliases");
    if(aliases)aliases.textContent="Fiber aliases: "+names.map(function(n){return "y_"+n;}).join(", ")+". The symbolic engine translates these safely to internal coordinates.";
    var axes=qa(".matrix-axis",el("metricGrid")),n=dimension();
    if(axes.length>=2*n){for(var i=0;i<n;i++){axes[i].textContent=names[i]||("x"+(i+1));axes[n+i].textContent=names[i]||("x"+(i+1));}}
  }
  function setCoordinates(names){renderCoordinateFields(names);}

  function injectCoordinateUI(){
    if(el("coordinateConfig"))return;
    var toolbar=document.querySelector(".calculator-toolbar");if(!toolbar)return;
    var box=document.createElement("div");box.id="coordinateConfig";box.className="coordinate-config";
    box.innerHTML='<div class="coordinate-config-head"><div><strong>Coordinates</strong><p>Name the coordinates as you use them in the metric. Examples: t, r, theta, phi or u, v, x, y.</p></div></div><div id="coordinateFields" class="coordinate-fields"></div><div id="coordinateAliases" class="coordinate-aliases"></div><div id="coordinateError" class="coordinate-error" hidden></div>';
    toolbar.insertAdjacentElement("afterend",box);
    renderCoordinateFields(["u","v","x","y"].slice(0,dimension()));
    el("dimension").addEventListener("change",function(){setTimeout(function(){renderCoordinateFields(coordinateNames);},0);});
    var load=el("loadExample");if(load)load.addEventListener("click",function(){setTimeout(syncBuiltInCoordinates,0);});
  }
  function syncBuiltInCoordinates(){
    activeCatalogueEntry=null;
    var v=el("exampleSelect")?el("exampleSelect").value:"";
    if(v==="randerspp"||v==="ppwaveMetric4"||v==="mkropinaPP")setCoordinates(["u","v","x","y"]);
    else if(v==="riemann2")setCoordinates(["x","y"]);
    else if(v==="minkowski4")setCoordinates(["t","x","y","z"]);
    else setCoordinates(defaultCoords(dimension()));
  }

  function setRadio(name,value){var n=document.querySelector('input[name="'+name+'"][value="'+value+'"]');if(n){n.checked=true;n.dispatchEvent(new Event("change",{bubbles:true}));}}
  function setMetricMatrix(matrix){
    for(var i=0;i<matrix.length;i++)for(var j=0;j<matrix.length;j++){
      var cell=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');if(cell)cell.value=matrix[i][j];
    }
  }
  function loadCatalogueEntry(entry){
    var clear=el("clearResults");if(clear)clear.click();
    el("dimension").value=String(entry.dim);el("dimension").dispatchEvent(new Event("change",{bubbles:true}));
    setRadio("inputMode","metric");setRadio("geometryMode","riemannian");
    setTimeout(function(){
      setCoordinates(entry.coords);setMetricMatrix(entry.matrix);activeCatalogueEntry=entry;
      var note=el("exampleNote");if(note)note.textContent=entry.title+" · "+entry.source+" · reference check: "+entry.validation+".";
      var drawer=el("metricCatalogueDrawer");if(drawer)drawer.open=false;
    },0);
  }

  function catalogueGroups(items){var seen=Object.create(null),out=[];items.forEach(function(x){if(!seen[x.group]){seen[x.group]=1;out.push(x.group);}});return out;}
  function renderCatalogue(){
    var items=window.FINSLER_METRIC_CATALOGUE||[];if(!items.length)return;
    var host=el("catalogueGrid"),search=el("catalogueSearch"),filter=el("catalogueGroup");if(!host||!search||!filter)return;
    if(!filter.dataset.ready){
      filter.innerHTML='<option value="">All groups</option>'+catalogueGroups(items).map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("");filter.dataset.ready="1";
      search.addEventListener("input",renderCatalogue);filter.addEventListener("change",renderCatalogue);
    }
    var q=search.value.trim().toLowerCase(),g=filter.value;
    var shown=items.filter(function(item){
      var hay=(item.title+" "+item.group+" "+item.description+" "+item.source).toLowerCase();return(!g||item.group===g)&&(!q||hay.indexOf(q)!==-1);
    });
    el("catalogueCount").textContent=shown.length+" of "+items.length+" entries";
    host.innerHTML="";
    if(!shown.length){host.innerHTML='<div class="catalogue-empty">No matching metrics.</div>';return;}
    shown.forEach(function(item){
      var card=document.createElement("article");card.className="catalogue-card";
      card.innerHTML='<div class="catalogue-card-main"><div class="catalogue-card-top"><h4>'+esc(item.title)+'</h4><span class="catalogue-group">'+esc(item.group)+'</span></div><p>'+esc(item.description)+'</p><div class="catalogue-meta"><span class="catalogue-chip">'+esc(item.source)+'</span><span class="catalogue-chip">'+esc(item.coords.join(", "))+'</span><span class="catalogue-chip is-verified">'+esc(item.validation)+'</span></div></div><button type="button" class="catalogue-load">Load</button>';
      card.querySelector("button").addEventListener("click",function(){loadCatalogueEntry(item);});host.appendChild(card);
    });
  }
  function injectCatalogueUI(){
    if(el("metricCatalogueDrawer"))return;
    var anchor=document.querySelector(".example-controls");if(!anchor)return;
    var drawer=document.createElement("details");drawer.id="metricCatalogueDrawer";drawer.className="metric-catalogue-drawer";
    drawer.innerHTML='<summary><span>Metric catalogue</span></summary><div class="catalogue-body"><p class="catalogue-intro">Search reference geometries, useful ansätze, and the principal metric families in Müller &amp; Grave, <em>Catalogue of Spacetimes</em> (arXiv:0904.4184). Loading an entry also sets its natural coordinate names.</p><div class="catalogue-controls"><input id="catalogueSearch" type="search" placeholder="Search Schwarzschild, wave, cosmology…"><select id="catalogueGroup"></select></div><p class="catalogue-count" id="catalogueCount"></p><div class="catalogue-grid" id="catalogueGrid"></div><p class="catalogue-validation-note">Catalogue checks compare the calculator convention Rᵏₗᵢⱼ with the paper's convention after matching index order. Heavy and special-function entries are marked separately; the experimental warning above still applies.</p></div>';
    anchor.insertAdjacentElement("afterend",drawer);renderCatalogue();
  }

  function expandDefinitions(expr,defs){
    var text=String(expr),names=Object.keys(defs||{});if(!names.length)return text;
    for(var pass=0;pass<6;pass++){
      var changed=false,node=math.parse(text);
      node=node.transform(function(child){
        if(child&&child.isSymbolNode&&Object.prototype.hasOwnProperty.call(defs,child.name)){
          changed=true;return math.parse("("+defs[child.name]+")");
        }
        return child;
      });
      text=node.toString({parenthesis:"auto"});if(!changed)break;
    }
    return text;
  }
  function displayInternalArg(expr,names){
    var s=String(expr);for(var i=names.length;i>=1;i--)s=s.replace(new RegExp("\\bx"+i+"\\b","g"),names[i-1]);return s;
  }
  function translateExpression(expr,ctx,allowFiber){
    var text=expandDefinitions(expr,activeCatalogueEntry&&activeCatalogueEntry.definitions?activeCatalogueEntry.definitions:{}),node=math.parse(text),names=ctx.coords;
    var symbolMap=Object.create(null);
    names.forEach(function(name,i){symbolMap[name]="x"+(i+1);if(allowFiber){symbolMap["y_"+name]="y"+(i+1);symbolMap["v_"+name]="y"+(i+1);}});
    node=node.transform(function(child){if(child&&child.isSymbolNode&&symbolMap[child.name])return math.parse(symbolMap[child.name]);return child;});
    node=node.transform(function(child){
      if(!child||!child.isFunctionNode||!child.fn||!child.fn.isSymbolNode)return child;
      var name=child.fn.name;if(KNOWN_FUNCTIONS[name])return child;
      var args=child.args.map(function(a){return a.toString({parenthesis:"auto"});});
      var key=name+"\u0000"+args.join("\u0001"),found=ctx.functionByKey[key];
      if(!found){
        found={token:"__uf"+ctx.functions.length,name:name,args:args,argLabels:args.map(function(a){return displayInternalArg(a,names);})};
        ctx.functionByKey[key]=found;ctx.functions.push(found);
      }
      return math.parse(found.token);
    });
    return node.toString({parenthesis:"auto"});
  }
  function dependencyOutputs(selected,data){
    var out={};Object.keys(selected||{}).forEach(function(k){out[k]=!!selected[k];});
    function need(k){out[k]=true;}
    if(out.inverse)need("metric");
    if(out.cartan)need("metric");
    if(out.spray){need("metric");need("inverse");}
    if(out.nonlinear){need("metric");need("inverse");need("spray");}
    if(out.connections){need("metric");need("inverse");need("spray");need("nonlinear");}
    if(out.curvature){need("metric");need("inverse");need("spray");need("nonlinear");}
    if(out.deviation){need("metric");need("inverse");need("spray");need("nonlinear");need("curvature");}
    if(out.ricci){need("metric");need("inverse");need("spray");need("nonlinear");need("curvature");}
    if(out.affine){need("metric");need("inverse");}
    return out;
  }
  function translatePayload(data,wrapper){
    var clone=Object.assign({},data),coords=currentCoords();
    if(coords.length!==data.n)throw new Error("The number of coordinate names must match the selected dimension.");
    var ctx={coords:coords,functions:[],functionByKey:Object.create(null)};
    wrapper._displayOutputs=Object.assign({},data.outputs||{});wrapper._displayContext=ctx;
    clone.outputs=dependencyOutputs(data.outputs||{},data);
    if(data.metricEntries)clone.metricEntries=data.metricEntries.map(function(row){return row.map(function(v){return translateExpression(v,ctx,false);});});
    if(data.alphaBeta){clone.alphaBeta=Object.assign({},data.alphaBeta);if(data.alphaBeta.b)clone.alphaBeta.b=data.alphaBeta.b.map(function(v){return translateExpression(v,ctx,false);});}
    if(data.L)clone.L=translateExpression(data.L,ctx,true);
    clone.symbolicFunctions=ctx.functions;
    return clone;
  }

  function functionDisplay(token,ctx){
    var m=/^__uf(\d+)(?:_d([0-9_]+))?$/.exec(token);if(!m)return token;
    var f=ctx.functions[Number(m[1])];if(!f)return token;
    if(!m[2])return f.name+"("+f.argLabels.join(",")+")";
    var inds=m[2].split("_").map(Number),labels=[];
    inds.forEach(function(idx){var a=f.argLabels[idx-1]||("s"+idx);labels.push(/^[A-Za-z_][A-Za-z0-9_]*$/.test(a)?a:(f.argLabels.length===1?"s":"s"+idx));});
    return f.name+"_"+labels.join("_");
  }
  function displayExpression(expr,ctx){
    if(expr===undefined||expr===null)return expr;
    var s=String(expr);
    s=s.replace(/__uf\d+(?:_d[0-9_]+)?/g,function(t){return functionDisplay(t,ctx);});
    for(var i=ctx.coords.length;i>=1;i--){
      var name=ctx.coords[i-1];s=s.replace(new RegExp("\\by"+i+"\\b","g"),"y_"+name);s=s.replace(new RegExp("\\bx"+i+"\\b","g"),name);
    }
    return s;
  }
  function translateSummary(summary,ctx){
    if(!summary)return summary;var out={};Object.keys(summary).forEach(function(k){var v=summary[k];
      if(Array.isArray(v))out[k]=v.map(function(row){return Array.isArray(row)?row.map(function(x){return displayExpression(x,ctx);}):displayExpression(row,ctx);});
      else if(typeof v==="string")out[k]=displayExpression(v,ctx);else out[k]=v;
    });return out;
  }
  function translateMessage(msg,ctx){
    var m=Object.assign({},msg);if(m.value!==undefined)m.value=displayExpression(m.value,ctx);if(m.summary)m.summary=translateSummary(m.summary,ctx);return m;
  }

  function WrappedWorker(script,options){
    var actual=String(script).indexOf("finsler-worker-v3.js")!==-1?"finsler-worker-v4.js?v=1":script;
    var native=new NativeWorker(actual,options),self=this;
    this._native=native;this._onmessage=null;this._onerror=null;this._displayOutputs={};this._displayContext={coords:defaultCoords(dimension()),functions:[]};this._activeStep=null;this._sectionTitles={};
    native.onmessage=function(event){self._handleMessage(event);};
    native.onerror=function(event){if(self._onerror)self._onerror.call(self,event);};
  }
  WrappedWorker.prototype._finishInternalStep=function(now){
    var s=this._activeStep;if(s&&!s.hadComponent)logTiming(s.label,now-s.started,"internal prerequisite");this._activeStep=null;
  };
  WrappedWorker.prototype._handleMessage=function(event){
    var now=performance.now(),raw=event.data||{},msg=translateMessage(raw,this._displayContext),section=raw.section,key=section?outputKey(section):null,selected=key?this._displayOutputs[key]!==false:true;
    if(raw.type==="stepStart"){
      this._finishInternalStep(now);this._activeStep={label:raw.label||"Internal step",started:now,hadComponent:false};
      if(this._onmessage)this._onmessage.call(this,{data:msg});return;
    }
    if(raw.type==="sectionStart"){this._sectionTitles[section]=raw.title||section;if(selected&&this._onmessage)this._onmessage.call(this,{data:msg});return;}
    if(raw.type==="component"){
      if(this._activeStep)this._activeStep.hadComponent=true;
      if(selected){if(this._onmessage)this._onmessage.call(this,{data:msg});}
      else logTiming(msg.label,Number(raw.elapsedMs)||0,"prerequisite · hidden output");
      return;
    }
    if(raw.type==="sectionComplete"){
      if(selected){if(this._onmessage)this._onmessage.call(this,{data:msg});}
      else logTiming(this._sectionTitles[section]||section,Number(raw.elapsedMs)||0,"prerequisite section");
      return;
    }
    if(raw.type==="done"||raw.type==="error")this._finishInternalStep(now);
    if(this._onmessage)this._onmessage.call(this,{data:msg});
  };
  WrappedWorker.prototype.postMessage=function(data,transfer){
    try{var translated=(data&&data.type==="calculate")?translatePayload(data,this):data;this._native.postMessage(translated,transfer||[]);}catch(error){
      var self=this;setTimeout(function(){if(self._onmessage)self._onmessage.call(self,{data:{type:"error",message:error.message||String(error)}});},0);
    }
  };
  WrappedWorker.prototype.terminate=function(){return this._native.terminate();};
  WrappedWorker.prototype.addEventListener=function(type,fn,opts){return this._native.addEventListener(type,fn,opts);};
  WrappedWorker.prototype.removeEventListener=function(type,fn,opts){return this._native.removeEventListener(type,fn,opts);};
  Object.defineProperty(WrappedWorker.prototype,"onmessage",{get:function(){return this._onmessage;},set:function(fn){this._onmessage=fn;}});
  Object.defineProperty(WrappedWorker.prototype,"onerror",{get:function(){return this._onerror;},set:function(fn){this._onerror=fn;}});
  WrappedWorker.__finslerEnhanced=true;window.Worker=WrappedWorker;

  function installStickyCollapse(){
    document.addEventListener("click",function(event){
      var button=event.target.closest&&event.target.closest(".expression-toggle");if(!button)return;
      setTimeout(function(){
        if(button.getAttribute("aria-expanded")!=="true")return;
        var parent=button.closest(".matrix-summary,.summary-expandable,.component-main,.component-formula-host")||button.parentElement.parentElement;
        var expanded=parent&&parent.querySelector(".expanded-expression");if(!expanded||expanded.hidden||expanded.querySelector(".sticky-collapse-bar"))return;
        var bar=document.createElement("div");bar.className="sticky-collapse-bar";bar.innerHTML='<button type="button" class="sticky-collapse-button">Collapse</button>';
        expanded.insertBefore(bar,expanded.firstChild);bar.querySelector("button").addEventListener("click",function(e){e.preventDefault();button.click();button.scrollIntoView({block:"nearest"});});
      },0);
    });
  }

  function initEnhancements(){injectCoordinateUI();injectCatalogueUI();installStickyCollapse();renderCatalogue();updateCoordinatePresentation();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(initEnhancements,0);});else setTimeout(initEnhancements,0);
})();