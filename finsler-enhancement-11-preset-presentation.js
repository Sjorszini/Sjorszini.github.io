(function(){
  "use strict";

  var DISPLAY_PREF_KEY="finslerDisplayPrefsV1";
  try{localStorage.removeItem(DISPLAY_PREF_KEY);}catch(e){}

  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
  function coords(){return qa(".coordinate-input").map(function(n){return n.value.trim();});}
  function regexEscape(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function greekTex(name){var m={theta:"\\theta",phi:"\\phi",psi:"\\psi",eta:"\\eta",rho:"\\rho",tau:"\\tau",sigma:"\\sigma",lambda:"\\lambda",mu:"\\mu",nu:"\\nu"};return m[name]||null;}
  function coordTex(name){var g=greekTex(name);if(g)return g;if(/^[A-Za-z]$/.test(name))return name;return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9_]/g,"")+"}";}

  function installFreshWorker(){
    var Base=window.Worker;
    if(!Base||Base.__finslerSymbolicFresh)return;
    function FreshWorker(url,options){
      var text=String(url||"");
      if(/(?:^|\/)finsler-worker-v4\.js(?:\?[^#]*)?$/.test(text))text=text.replace(/finsler-worker-v4\.js(?:\?[^#]*)?$/,"finsler-worker-v4-symbolic.js?v=1");
      return new Base(text,options);
    }
    FreshWorker.prototype=Base.prototype;
    try{Object.setPrototypeOf(FreshWorker,Base);}catch(e){}
    FreshWorker.__finslerSymbolicFresh=true;
    window.Worker=FreshWorker;
  }

  function resetPresetNotation(event){
    var target=event.target&&event.target.closest?event.target.closest(".catalogue-load,#loadExample"):null;
    if(!target)return;
    var constants=el("constantsInput"),functions=el("functionsInput");
    if(constants)constants.value="";
    if(functions)functions.value="";
  }

  function cleanTex(text){
    var s=String(text||"");
    s=s.replace(/\\cdot\s*/g,"\\,");
    coords().forEach(function(name){
      var g=greekTex(name);if(!g)return;
      var n=regexEscape(name),rep="y_{"+g+"}";
      s=s.replace(new RegExp("y_\\{"+n+"\\}","g"),rep)
         .replace(new RegExp("y\\\\_"+n+"\\b","g"),rep)
         .replace(new RegExp("y_"+n+"\\b","g"),rep);
    });
    return s;
  }

  function cleanMathSource(root){
    if(!root)return;
    if(document.createTreeWalker){
      var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),node;
      while((node=walker.nextNode())){
        if(node.parentElement&&node.parentElement.closest("mjx-container,script,style,code,pre"))continue;
        var changed=cleanTex(node.nodeValue);
        if(changed!==node.nodeValue)node.nodeValue=changed;
      }
    }
    qa("[data-finsler-copy-source]",root).forEach(function(n){
      if(n.dataset.finslerCopySource)n.dataset.finslerCopySource=cleanTex(n.dataset.finslerCopySource);
      if(n.dataset.finslerDisplayBase)n.dataset.finslerDisplayBase=cleanTex(n.dataset.finslerDisplayBase);
    });
  }

  function installMathJaxCleanup(){
    if(!window.MathJax||!MathJax.typesetPromise||MathJax.__finslerCleanMultiplication)return;
    var previous=MathJax.typesetPromise.bind(MathJax);
    MathJax.typesetPromise=function(nodes){(nodes||[]).forEach(cleanMathSource);return previous(nodes);};
    MathJax.__finslerCleanMultiplication=true;
  }

  function updateFiberHint(){
    var hint=el("fiberHint"),names=coords();if(!hint||!names.length)return;
    var first=names[0]||"t";
    hint.innerHTML="Fiber coordinates: "+names.map(function(name){return "\\(y_{"+coordTex(name)+"}\\)";}).join(", ")+". A call such as "+esc("a("+first+")")+" is treated as a coordinate-dependent function; a bare symbol such as M is a constant.";
    if(window.MathJax&&MathJax.typesetPromise)MathJax.typesetPromise([hint]);
  }

  function removeDisplayMenu(){var menu=el("finslerDisplayMenu");if(menu)menu.remove();}
  function updateToolbarWording(){
    var eyebrow=document.querySelector(".calculator-toolbar .toolbar-eyebrow");if(eyebrow)eyebrow.textContent="Calculator";
    var title=document.querySelector(".calculator-toolbar .toolbar-title h2");if(title)title.textContent="Set up your geometry";
  }

  function init(){
    installFreshWorker();installMathJaxCleanup();updateToolbarWording();removeDisplayMenu();updateFiberHint();
    document.addEventListener("click",resetPresetNotation,true);
    document.addEventListener("change",function(e){if(e.target&&e.target.matches&&e.target.matches(".coordinate-input,#dimension"))setTimeout(updateFiberHint,0);});
    document.addEventListener("click",function(e){if(e.target&&e.target.closest&&e.target.closest(".catalogue-load,#loadExample"))setTimeout(updateFiberHint,80);});
    var observer=new MutationObserver(function(){removeDisplayMenu();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    var results=el("results");if(results)new MutationObserver(function(records){records.forEach(function(r){Array.prototype.forEach.call(r.addedNodes,function(n){if(n.nodeType===1)cleanMathSource(n);});});}).observe(results,{childList:true,subtree:true});
    window.FINSLER_PRESET_PRESENTATION_FIXES={cleanTex:cleanTex,updateFiberHint:updateFiberHint};
  }

  installFreshWorker();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
