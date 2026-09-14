(function(){
  "use strict";

  function el(id){return document.getElementById(id);}
  function replaceLegacy(expr,coords){
    if(!expr||!window.math)return expr;
    try{
      var map={};
      coords.forEach(function(name,i){map["x"+(i+1)]=name;map["y"+(i+1)]="y_"+name;});
      return math.parse(expr).transform(function(child){
        if(child&&child.isSymbolNode&&map[child.name]) return math.parse(map[child.name]);
        return child;
      }).toString({parenthesis:"auto"});
    }catch(e){return expr;}
  }
  function currentCoords(){return Array.prototype.map.call(document.querySelectorAll(".coordinate-input"),function(n){return n.value.trim();});}
  function normalizeLegacyAliases(){
    var coords=currentCoords();
    document.querySelectorAll(".metric-entry,.oneform-entry,#lagrangian").forEach(function(n){n.value=replaceLegacy(n.value,coords);});
    var f=el("functionsInput");if(f)f.value=replaceLegacy(f.value,coords);
  }
  function tidyTensorSummaries(root){
    (root||document).querySelectorAll("#section-nonlinear,#section-deviation,#section-ricci,#section-affineRicci").forEach(function(sec){
      var summary=sec.querySelector(".section-summary");if(summary)summary.hidden=true;
      var list=sec.querySelector(".component-list"),empty=sec.querySelector("[data-empty]");
      if(list&&empty&&list.children.length===0){empty.hidden=false;}
    });
  }
  function init(){
    var calc=el("calculateSelected");
    if(calc)calc.addEventListener("click",normalizeLegacyAliases,true);
    var results=el("results");
    if(results){
      new MutationObserver(function(){tidyTensorSummaries(results);}).observe(results,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden"]});
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();