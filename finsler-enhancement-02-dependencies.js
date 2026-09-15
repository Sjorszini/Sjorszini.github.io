(function(){
  "use strict";
  var order=["metric","inverse","cartan","spray","nonlinear","connections","curvature","deviation","ricci","affine"];
  var names={metric:"metric / fundamental tensor",inverse:"inverse metric",cartan:"Cartan tensor",spray:"geodesic spray",nonlinear:"nonlinear connection",connections:"connection coefficients",curvature:"nonlinear curvature",deviation:"geodesic deviation",ricci:"Finsler-Ricci contraction",affine:"affine curvature"};
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function selected(){var o={};qa("[data-output]").forEach(function(n){o[n.dataset.output]=!!n.checked;});return o;}
  function closure(selectedOutputs){
    var o={};Object.keys(selectedOutputs).forEach(function(k){o[k]=!!selectedOutputs[k];});
    function need(k){o[k]=true;}
    if(o.inverse)need("metric");
    if(o.cartan)need("metric");
    if(o.spray){need("metric");need("inverse");}
    if(o.nonlinear){need("metric");need("inverse");need("spray");}
    if(o.connections){need("metric");need("inverse");need("spray");need("nonlinear");}
    if(o.curvature){need("metric");need("inverse");need("spray");need("nonlinear");need("connections");}
    if(o.deviation){need("metric");need("inverse");need("spray");need("nonlinear");need("connections");need("curvature");}
    if(o.ricci){need("metric");need("inverse");need("spray");need("nonlinear");need("connections");need("curvature");}
    if(o.affine){need("metric");need("inverse");need("connections");}
    return o;
  }
  function ensureBox(){
    var box=document.getElementById("finslerDependencyHint");if(box)return box;
    var actions=document.querySelector(".option-actions"),groups=document.querySelector(".output-groups");if(!groups)return null;
    box=document.createElement("div");box.id="finslerDependencyHint";box.className="finsler-dependency-hint";box.setAttribute("role","note");box.setAttribute("aria-live","polite");
    if(actions&&actions.nextSibling)actions.parentNode.insertBefore(box,actions.nextSibling);else groups.parentNode.insertBefore(box,groups);
    return box;
  }
  function update(){
    var box=ensureBox();if(!box)return;
    var s=selected(),required=closure(s),hidden=[];
    order.forEach(function(k){if(required[k]&&!s[k])hidden.push(names[k]||k);});
    if(!Object.keys(s).some(function(k){return s[k];})){
      box.innerHTML='<strong>Computation plan:</strong> select an output to see its prerequisites.';return;
    }
    if(!hidden.length){box.innerHTML='<strong>Computation plan:</strong> all required intermediate quantities are already selected for display.';return;}
    box.innerHTML='<strong>Computed in the background:</strong> '+hidden.map(function(x){return '<span>'+x+'</span>';}).join('<b aria-hidden="true">→</b>')+'<small>These prerequisites are needed by the selected outputs but stay hidden unless you check them.</small>';
  }
  function addStyles(){
    if(document.getElementById("finsler-dependency-styles"))return;
    var style=document.createElement("style");style.id="finsler-dependency-styles";
    style.textContent='.finsler-dependency-hint{margin:.75rem 0 1rem;padding:.7rem .8rem;border:1px solid rgba(67,76,94,.18);border-radius:.7rem;background:rgba(246,248,251,.82);font-size:.82rem;line-height:1.45;color:#48505d}.finsler-dependency-hint strong{color:#252b35}.finsler-dependency-hint span{white-space:nowrap}.finsler-dependency-hint b{font-weight:400;margin:0 .32rem;opacity:.55}.finsler-dependency-hint small{display:block;margin-top:.3rem;color:#687180}';
    document.head.appendChild(style);
  }
  function init(){
    addStyles();update();
    document.addEventListener("change",function(e){if(e.target&&e.target.matches&&e.target.matches("[data-output]"))update();});
    ["selectAllOutputs","selectEssentials","clearAllOutputs"].forEach(function(id){var n=document.getElementById(id);if(n)n.addEventListener("click",function(){setTimeout(update,0);});});
    window.FINSLER_DEPENDENCY_API={closure:closure,update:update};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();