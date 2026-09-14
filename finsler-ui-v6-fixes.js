(function(){
  "use strict";

  var currentDefinitions=null;
  var lastCoords=[];
  var tidyScheduled=false;

  /* Keep symbolic simplification in the Web Worker, never on the UI thread. */
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

  /* Batch MathJax work instead of starting a render for every component. */
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
      var batch=queue.splice(0,8).filter(function(n){return n&&n.isConnected!==false;});
      batch.forEach(function(n){queued.delete(n);});
      if(!batch.length){if(queue.length)schedule();return;}
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

  /*
   * Pace messages from the symbolic worker. A generic 4D curvature tensor may
   * finish many components close together; delivering all of those messages in
   * one event-loop burst used to make the tab appear frozen while the DOM was
   * being populated. Six messages (or ~8 ms of work) are released per frame.
   */
  function installWorkerMessagePacer(){
    var NativeWorker=window.Worker;
    if(!NativeWorker || NativeWorker.__finslerPaced) return;
    var OMIT_SUMMARY={nonlinear:1,deviation:1,ricci:1,affineRicci:1};

    function PacedWorker(url,options){
      var native=new NativeWorker(url,options),self=this;
      this._native=native;
      this._onmessage=null;
      this._onerror=null;
      this._queue=[];
      this._scheduled=false;
      this._terminated=false;
      native.onmessage=function(event){
        if(self._terminated)return;
        var data=event.data;
        if(data&&data.type==="sectionComplete"&&OMIT_SUMMARY[data.section]&&data.summary){
          data=Object.assign({},data,{summary:null});
        }
        self._queue.push({kind:"message",event:{data:data}});
        self._schedule();
      };
      native.onerror=function(event){
        if(self._terminated)return;
        self._queue.push({kind:"error",event:event});
        self._schedule();
      };
    }
    PacedWorker.prototype._schedule=function(){
      var self=this;if(self._scheduled||self._terminated)return;
      self._scheduled=true;
      requestAnimationFrame(function(){self._flush();});
    };
    PacedWorker.prototype._flush=function(){
      this._scheduled=false;if(this._terminated)return;
      var started=performance.now(),count=0;
      while(this._queue.length&&count<6&&(performance.now()-started)<8){
        var item=this._queue.shift();count++;
        if(item.kind==="message"&&this._onmessage)this._onmessage.call(this,item.event);
        else if(item.kind==="error"&&this._onerror)this._onerror.call(this,item.event);
      }
      if(this._queue.length)this._schedule();
    };
    PacedWorker.prototype.postMessage=function(data,transfer){this._native.postMessage(data,transfer||[]);};
    PacedWorker.prototype.terminate=function(){this._terminated=true;this._queue.length=0;return this._native.terminate();};
    Object.defineProperty(PacedWorker.prototype,"onmessage",{get:function(){return this._onmessage;},set:function(fn){this._onmessage=fn;}});
    Object.defineProperty(PacedWorker.prototype,"onerror",{get:function(){return this._onerror;},set:function(fn){this._onerror=fn;}});
    PacedWorker.__finslerPaced=true;
    window.Worker=PacedWorker;
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
    installWorkerMessagePacer();
    lastCoords=coords();
    document.addEventListener("click",function(event){var load=event.target.closest&&event.target.closest(".catalogue-load");if(load)rememberCatalogueEntry(load);if(event.target&&event.target.id==="loadExample")currentDefinitions=null;},true);
    document.addEventListener("change",function(event){if(event.target&&event.target.classList&&event.target.classList.contains("coordinate-input"))setTimeout(renameDefinitionCoordinates,0);},false);
    var calc=el("calculateSelected");if(calc)calc.addEventListener("click",normalizeBeforeCalculation,true);
    var results=el("results");if(results)new MutationObserver(function(){scheduleTidy(results);}).observe(results,{subtree:true,childList:true});
  }

  /* defer scripts execute before DOMContentLoaded; install guards immediately */
  installMainThreadSimplifyGuard();
  installMathJaxQueue();
  installWorkerMessagePacer();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();