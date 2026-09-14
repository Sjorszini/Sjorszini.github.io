(function(){
  "use strict";

  var currentDefinitions=null;
  var lastCoords=[];
  var tidyScheduled=false;

  /*
   * Performance guard: symbolic simplification belongs in the Web Worker.
   * The main UI previously called math.simplify() for every returned component
   * while testing whether it vanished. For large tensors that could freeze the
   * browser even though the actual calculation was off-thread.
   *
   * Keep only trivial numeric simplification in the window. For symbolic input,
   * return the parsed expression unchanged; selected worker outputs have already
   * gone through the worker's presentation-simplification passes.
   */
  function installMainThreadSimplifyGuard(){
    if(!window.math || math.__finslerUiSimplifyGuard) return;
    var original=math.simplify.bind(math);
    math.__finslerUiOriginalSimplify=original;
    math.simplify=function(expr){
      if(typeof expr==="string"){
        var s=expr.trim();
        if(!s) return math.parse("0");
        if(/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(s)) return original(s);
        try{return math.parse(s);}catch(e){return {toString:function(){return s;}};}
      }
      return expr;
    };
    math.__finslerUiSimplifyGuard=true;
  }

  /*
   * MathJax is expensive when dozens of tensor components arrive almost at once.
   * Queue calls and typeset a small batch at a time so the event loop continues
   * to service the live timer, scrolling and the Cancel/Clear controls.
   */
  function installMathJaxQueue(){
    if(!window.MathJax || !MathJax.typesetPromise || MathJax.__finslerQueued) return;
    var original=MathJax.typesetPromise.bind(MathJax);
    var queue=[];
    var queued=new Set();
    var scheduled=false;
    var running=false;

    function schedule(){
      if(scheduled || running || !queue.length) return;
      scheduled=true;
      setTimeout(flush,40);
    }
    function flush(){
      scheduled=false;
      if(running || !queue.length) return;
      var batch=queue.splice(0,8);
      batch.forEach(function(n){queued.delete(n);});
      running=true;
      original(batch).catch(function(){}).then(function(){
        running=false;
        if(queue.length) setTimeout(schedule,20);
      });
    }
    MathJax.typesetPromise=function(nodes){
      (nodes||[]).forEach(function(node){
        if(node && node.isConnected!==false && !queued.has(node)){
          queued.add(node);
          queue.push(node);
        }
      });
      schedule();
      return Promise.resolve();
    };
    MathJax.__finslerQueued=true;
  }

  function el(id){return document.getElementById(id);}
  function coords(){return Array.prototype.map.call(document.querySelectorAll(".coordinate-input"),function(n){return n.value.trim();});}
  function replaceSymbols(expr,map){
    if(!expr||!window.math)return expr;
    try{return math.parse(expr).transform(function(child){if(child&&child.isSymbolNode&&map[child.name])return math.parse(map[child.name]);return child;}).toString({parenthesis:"auto"});}catch(e){return expr;}
  }
  function replaceLegacy(expr,names){var map={};names.forEach(function(name,i){map["x"+(i+1)]=name;map["y"+(i+1)]="y_"+name;});return replaceSymbols(expr,map);}
  function expandDefinitions(expr,defs){
    var text=String(expr),keys=Object.keys(defs||{});if(!keys.length||!window.math)return text;
    for(var pass=0;pass<8;pass++){
      var changed=false;
      try{text=math.parse(text).transform(function(child){if(child&&child.isSymbolNode&&Object.prototype.hasOwnProperty.call(defs,child.name)){changed=true;return math.parse("("+defs[child.name]+")");}return child;}).toString({parenthesis:"auto"});}catch(e){return text;}
      if(!changed)break;
    }
    return text;
  }
  function normalizeBeforeCalculation(){
    var names=coords();
    document.querySelectorAll(".metric-entry,.oneform-entry,#lagrangian").forEach(function(n){var v=n.value;if(currentDefinitions&&n.classList.contains("metric-entry"))v=expandDefinitions(v,currentDefinitions);n.value=replaceLegacy(v,names);});
    var f=el("functionsInput");if(f)f.value=replaceLegacy(f.value,names);
  }
  function renameDefinitionCoordinates(){
    var now=coords();if(!currentDefinitions){lastCoords=now;return;}if(lastCoords.length!==now.length){lastCoords=now;return;}
    var map={};for(var i=0;i<now.length;i++)if(lastCoords[i]&&lastCoords[i]!==now[i])map[lastCoords[i]]=now[i];
    if(Object.keys(map).length)Object.keys(currentDefinitions).forEach(function(k){currentDefinitions[k]=replaceSymbols(currentDefinitions[k],map);});
    lastCoords=now;
  }
  function rememberCatalogueEntry(button){
    var card=button.closest(".catalogue-card"),title=card&&card.querySelector("h4")?card.querySelector("h4").textContent:"";
    var items=window.FINSLER_METRIC_CATALOGUE||[],found=null;for(var i=0;i<items.length;i++)if(items[i].title===title){found=items[i];break;}
    currentDefinitions=found?Object.assign({},found.definitions||{}):null;
    setTimeout(function(){lastCoords=coords();},40);
  }
  function tidyTensorSummaries(root){
    (root||document).querySelectorAll("#section-nonlinear,#section-deviation,#section-ricci,#section-affineRicci").forEach(function(sec){
      var summary=sec.querySelector(".section-summary");if(summary)summary.hidden=true;
      var list=sec.querySelector(".component-list"),empty=sec.querySelector("[data-empty]");if(list&&empty&&list.children.length===0)empty.hidden=false;
    });
  }
  function scheduleTidy(root){
    if(tidyScheduled)return;
    tidyScheduled=true;
    requestAnimationFrame(function(){tidyScheduled=false;tidyTensorSummaries(root);});
  }
  function init(){
    installMainThreadSimplifyGuard();
    installMathJaxQueue();
    lastCoords=coords();
    document.addEventListener("click",function(event){var load=event.target.closest&&event.target.closest(".catalogue-load");if(load)rememberCatalogueEntry(load);if(event.target&&event.target.id==="loadExample")currentDefinitions=null;},true);
    document.addEventListener("change",function(event){if(event.target&&event.target.classList&&event.target.classList.contains("coordinate-input"))setTimeout(renameDefinitionCoordinates,0);},false);
    var calc=el("calculateSelected");if(calc)calc.addEventListener("click",normalizeBeforeCalculation,true);
    var results=el("results");if(results)new MutationObserver(function(){scheduleTidy(results);}).observe(results,{subtree:true,childList:true});
  }

  /* defer scripts execute before DOMContentLoaded; install the guards immediately */
  installMainThreadSimplifyGuard();
  installMathJaxQueue();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();