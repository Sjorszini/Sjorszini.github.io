(function(){
  "use strict";

  var currentDefinitions=null;
  var lastCoords=[];
  var tidyScheduled=false;

  function el(id){return document.getElementById(id);}
  function coords(){return Array.prototype.map.call(document.querySelectorAll(".coordinate-input"),function(n){return n.value.trim();});}
  function regexEscape(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

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

  function coordinateTex(name){
    var greek={theta:"\\theta",phi:"\\phi",psi:"\\psi",eta:"\\eta",rho:"\\rho",tau:"\\tau",sigma:"\\sigma",lambda:"\\lambda",mu:"\\mu",nu:"\\nu"};
    if(greek[name])return greek[name];
    if(/^[A-Za-z]$/.test(name))return name;
    return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";
  }
  function functionTex(name){
    var greek={Phi:"\\Phi",Psi:"\\Psi",Theta:"\\Theta",Lambda:"\\Lambda",phi:"\\phi",psi:"\\psi",theta:"\\theta",lambda:"\\lambda"};
    if(greek[name])return greek[name];
    if(/^[A-Za-z]$/.test(name))return name;
    return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";
  }

  function splitTopLevel(text){
    var out=[],buf="",depth=0;
    String(text||"").split("").forEach(function(ch){
      if(ch==="(")depth++; else if(ch===")")depth=Math.max(0,depth-1);
      if((ch===","||ch===";"||ch==="\n")&&depth===0){if(buf.trim())out.push(buf.trim());buf="";} else buf+=ch;
    });
    if(buf.trim())out.push(buf.trim());
    return out;
  }
  function declaredFunctions(){
    var input=el("functionsInput"),out=[];
    if(!input)return out;
    splitTopLevel(input.value).forEach(function(part){
      var m=/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(part);
      if(m)out.push({name:m[1],args:splitTopLevel(m[2])});
    });
    return out;
  }

  function normalizeFiberTex(root){
    if(!root || !document.createTreeWalker) return;
    var names=coords();
    if(!names.length) return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),node;
    while((node=walker.nextNode())){
      var text=node.nodeValue,changed=text;
      names.forEach(function(name){
        if(!name)return;
        var sub=coordinateTex(name),escaped=regexEscape(name);
        changed=changed
          .replace(new RegExp("\\by_"+escaped+"\\b","g"),"y_{"+sub+"}")
          .replace(new RegExp("\\by\\\\_"+escaped+"\\b","g"),"y_{"+sub+"}")
          .replace(new RegExp("\\bv_"+escaped+"\\b","g"),"v_{"+sub+"}")
          .replace(new RegExp("\\bv\\\\_"+escaped+"\\b","g"),"v_{"+sub+"}");
      });
      if(changed!==text)node.nodeValue=changed;
    }
  }

  function prettyDerivativeSymbols(text){
    var funcs=declaredFunctions();
    funcs.forEach(function(fn){
      var name=regexEscape(fn.name);
      var re=new RegExp("(^|[^A-Za-z0-9\\\\])"+name+"((?:\\\\_[A-Za-z][A-Za-z0-9]*)+)","g");
      text=text.replace(re,function(all,prefix,suffix){
        var labels=suffix.split("\\_").filter(Boolean);
        if(!labels.length)return all;
        var allowed=coords();
        if(labels.some(function(label){return allowed.indexOf(label)===-1;}))return all;
        return prefix+functionTex(fn.name)+"_{,"+labels.map(coordinateTex).join("")+"}";
      });
    });
    return text;
  }

  function normalizeExponentParens(text){
    return text
      .replace(/\^\{\\left\(\s*([+-]?\d+)\s*\\right\)\}/g,"^{$1}")
      .replace(/\^\{\(\s*([+-]?\d+)\s*\)\}/g,"^{$1}")
      .replace(/\^\{\\left\{\s*([+-]?\d+)\s*\\right\}\}/g,"^{$1}");
  }

  function stripMinusFractionWrappers(text){
    var needle="-\\left(",pos=0;
    while((pos=text.indexOf(needle,pos))!==-1){
      var contentStart=pos+needle.length,j=contentStart;
      while(/\s/.test(text.charAt(j)))j++;
      if(text.slice(j,j+5)!=="\\frac"){pos=contentStart;continue;}
      var depth=1,k=contentStart,close=-1;
      while(k<text.length){
        if(text.slice(k,k+6)==="\\left("){depth++;k+=6;continue;}
        if(text.slice(k,k+7)==="\\right)"){depth--;if(depth===0){close=k;break;}k+=7;continue;}
        k++;
      }
      if(close<0){pos=contentStart;continue;}
      var after=close+7;
      if(text.charAt(after)==="^"){pos=after;continue;}
      text=text.slice(0,pos)+"-"+text.slice(contentStart,close)+text.slice(after);
      pos+=1;
    }
    return text;
  }

  function readBraceGroup(text,start){
    if(text.charAt(start)!=="{")return null;
    var depth=0;
    for(var i=start;i<text.length;i++){
      if(text.charAt(i)==="{")depth++;
      else if(text.charAt(i)==="}"){
        depth--;
        if(depth===0)return {content:text.slice(start+1,i),end:i+1};
      }
    }
    return null;
  }
  function readFracAt(text,start){
    if(text.slice(start,start+5)!=="\\frac")return null;
    var p=start+5;
    while(/\s/.test(text.charAt(p)))p++;
    var num=readBraceGroup(text,p);if(!num)return null;
    p=num.end;while(/\s/.test(text.charAt(p)))p++;
    var den=readBraceGroup(text,p);if(!den)return null;
    return {num:num.content,den:den.content,end:den.end};
  }
  function flattenSimpleNestedFractions(text){
    var pos=0;
    while((pos=text.indexOf("\\frac",pos))!==-1){
      var outer=readFracAt(text,pos);if(!outer){pos+=5;continue;}
      var ntrim=outer.num.trim();
      if(ntrim.slice(0,5)==="\\frac"){
        var inner=readFracAt(ntrim,0);
        if(inner&&inner.end===ntrim.length&&/^\s*(?:[+-]?\d+(?:\.\d+)?|[A-Za-z]+)\s*$/.test(inner.den)){
          var replacement="\\frac{"+inner.num+"}{"+inner.den+"\\,"+outer.den+"}";
          text=text.slice(0,pos)+replacement+text.slice(outer.end);
          pos+=replacement.length;
          continue;
        }
      }
      pos=outer.end;
    }
    return text;
  }

  function moveSimpleNegativePowerToDenominator(text){
    var pos=0;
    while((pos=text.indexOf("\\frac",pos))!==-1){
      var fr=readFracAt(text,pos);if(!fr){pos+=5;continue;}
      var m=/^\s*([A-Za-z]|\\[A-Za-z]+)\^\{-(\d+)\}\s*$/.exec(fr.num);
      if(m){
        var replacement="\\frac{1}{"+m[1]+"^{"+m[2]+"}\\,"+fr.den+"}";
        text=text.slice(0,pos)+replacement+text.slice(fr.end);
        pos+=replacement.length;
        continue;
      }
      pos=fr.end;
    }
    return text;
  }

  function normalizePrettyTex(root){
    if(!root || !document.createTreeWalker)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),node;
    while((node=walker.nextNode())){
      var text=node.nodeValue;
      if(text.indexOf("\\[")===-1&&text.indexOf("\\(")===-1)continue;
      var changed=prettyDerivativeSymbols(text);
      changed=normalizeExponentParens(changed);
      changed=stripMinusFractionWrappers(changed);
      changed=flattenSimpleNestedFractions(changed);
      changed=moveSimpleNegativePowerToDenominator(changed);
      if(changed!==text)node.nodeValue=changed;
    }
  }

  function installMathJaxQueue(){
    if(!window.MathJax || !MathJax.typesetPromise || MathJax.__finslerQueued) return;
    var original=MathJax.typesetPromise.bind(MathJax),queue=[],queued=new Set(),scheduled=false,running=false;
    function schedule(){if(scheduled||running||!queue.length)return;scheduled=true;setTimeout(flush,40);}
    function flush(){
      scheduled=false;if(running||!queue.length)return;
      var batch=queue.splice(0,8).filter(function(n){return n&&n.isConnected!==false;});
      batch.forEach(function(n){queued.delete(n);normalizeFiberTex(n);normalizePrettyTex(n);});
      if(!batch.length){if(queue.length)schedule();return;}
      running=true;
      original(batch).catch(function(){}).then(function(){running=false;if(queue.length)setTimeout(schedule,20);});
    }
    MathJax.typesetPromise=function(nodes){
      (nodes||[]).forEach(function(node){if(node&&node.isConnected!==false&&!queued.has(node)){queued.add(node);queue.push(node);}});
      schedule();return Promise.resolve();
    };
    MathJax.__finslerQueued=true;
  }

  function installWorkerMessagePacer(){
    var NativeWorker=window.Worker;
    if(!NativeWorker || NativeWorker.__finslerPaced) return;
    var OMIT_SUMMARY={nonlinear:1,deviation:1,ricci:1,affineRicci:1};
    function PacedWorker(url,options){
      var native=new NativeWorker(url,options),self=this;
      this._native=native;this._onmessage=null;this._onerror=null;this._queue=[];this._scheduled=false;this._terminated=false;
      native.onmessage=function(event){
        if(self._terminated)return;
        var data=event.data;
        if(data&&data.type==="sectionComplete"&&OMIT_SUMMARY[data.section]&&data.summary)data=Object.assign({},data,{summary:null});
        self._queue.push({kind:"message",event:{data:data}});self._schedule();
      };
      native.onerror=function(event){if(self._terminated)return;self._queue.push({kind:"error",event:event});self._schedule();};
    }
    PacedWorker.prototype._schedule=function(){var self=this;if(self._scheduled||self._terminated)return;self._scheduled=true;requestAnimationFrame(function(){self._flush();});};
    PacedWorker.prototype._flush=function(){
      this._scheduled=false;if(this._terminated)return;
      var started=performance.now(),count=0;
      while(this._queue.length&&count<6&&(performance.now()-started)<8){var item=this._queue.shift();count++;if(item.kind==="message"&&this._onmessage)this._onmessage.call(this,item.event);else if(item.kind==="error"&&this._onerror)this._onerror.call(this,item.event);}
      if(this._queue.length)this._schedule();
    };
    PacedWorker.prototype.postMessage=function(data,transfer){this._native.postMessage(data,transfer||[]);};
    PacedWorker.prototype.terminate=function(){this._terminated=true;this._queue.length=0;return this._native.terminate();};
    Object.defineProperty(PacedWorker.prototype,"onmessage",{get:function(){return this._onmessage;},set:function(fn){this._onmessage=fn;}});
    Object.defineProperty(PacedWorker.prototype,"onerror",{get:function(){return this._onerror;},set:function(fn){this._onerror=fn;}});
    PacedWorker.__finslerPaced=true;window.Worker=PacedWorker;
  }

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
    var items=window.FINSLER_METRIC_CATALOGUE||[],found=null;
    for(var i=0;i<items.length;i++)if(items[i].title===title){found=items[i];break;}
    currentDefinitions=found?Object.assign({},found.definitions||{}):null;
    setTimeout(function(){lastCoords=coords();},40);
  }
  function tidyTensorSummaries(root){
    (root||document).querySelectorAll("#section-nonlinear,#section-deviation,#section-ricci,#section-affineRicci").forEach(function(sec){
      var summary=sec.querySelector(".section-summary");if(summary)summary.hidden=true;
      var list=sec.querySelector(".component-list"),empty=sec.querySelector("[data-empty]");if(list&&empty)empty.hidden=list.children.length!==0;
    });
  }
  function scheduleTidy(root){if(tidyScheduled)return;tidyScheduled=true;requestAnimationFrame(function(){tidyScheduled=false;tidyTensorSummaries(root);});}
  function init(){
    installMainThreadSimplifyGuard();installMathJaxQueue();installWorkerMessagePacer();lastCoords=coords();
    document.addEventListener("click",function(event){var load=event.target.closest&&event.target.closest(".catalogue-load");if(load)rememberCatalogueEntry(load);if(event.target&&event.target.id==="loadExample")currentDefinitions=null;},true);
    document.addEventListener("change",function(event){if(event.target&&event.target.classList&&event.target.classList.contains("coordinate-input"))setTimeout(renameDefinitionCoordinates,0);},false);
    var calc=el("calculateSelected");if(calc)calc.addEventListener("click",normalizeBeforeCalculation,true);
    var results=el("results");if(results)new MutationObserver(function(){scheduleTidy(results);}).observe(results,{subtree:true,childList:true});
  }

  installMainThreadSimplifyGuard();installMathJaxQueue();installWorkerMessagePacer();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
