(function(){
  "use strict";
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function cleanSource(text){
    var s=String(text||"").trim();
    s=s.replace(/^\\\[/,"").replace(/\\\]$/,"").replace(/^\\\(/,"").replace(/\\\)$/,"").trim();
    return s;
  }
  function rhs(source){var s=cleanSource(source),p=s.indexOf("=");return p>=0?s.slice(p+1).trim():s;}
  function copyText(text,button){
    function done(ok){if(!button)return;var old=button.textContent;button.textContent=ok?"Copied":"Copy failed";setTimeout(function(){button.textContent=old;},900);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true);},function(){fallback();});return;}
    fallback();
    function fallback(){var t=document.createElement("textarea");t.value=text;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(t);done(ok);}
  }
  function formulaNode(host){
    if(!host)return null;
    return host.querySelector(".component-formula")||host.querySelector(".expanded-math-host .math-block")||host.querySelector(".math-block")||host.querySelector(".zero-summary");
  }
  function captureSource(host){
    if(!host)return false;
    var node=formulaNode(host),text=node?node.textContent:"";
    if(!text&&host.classList&&host.classList.contains("component-formula"))text=host.textContent||"";
    if(/\\\[|\\\(/.test(text)){
      var source=cleanSource(text);host.dataset.finslerCopySource=source;if(!host.dataset.finslerDisplayBase)host.dataset.finslerDisplayBase=source;return true;
    }
    return !!host.dataset.finslerCopySource;
  }
  function syncComponentTools(row){
    if(!row)return;var main=row.querySelector(".component-main");if(!main)return;
    var ready=captureSource(main),buttons=qa(".finsler-component-tools button",row);
    buttons.forEach(function(button){button.disabled=!ready;button.title=ready?(button.dataset.kind==="expr"?"Copy the right-hand side":"Copy LaTeX"):("Expand this long expression once to enable copying");});
  }
  function addComponentTools(row){
    if(!row||row.dataset.finslerCopyTools==="1"){syncComponentTools(row);return;}
    var main=row.querySelector(".component-main");if(!main)return;
    captureSource(main);row.dataset.finslerCopyTools="1";
    var tools=document.createElement("div");tools.className="finsler-component-tools";tools.setAttribute("aria-label","Component actions");
    var expr=document.createElement("button");expr.type="button";expr.dataset.kind="expr";expr.textContent="Copy expression";
    var latex=document.createElement("button");latex.type="button";latex.dataset.kind="latex";latex.textContent="Copy LaTeX";
    expr.addEventListener("click",function(){if(captureSource(main))copyText(rhs(main.dataset.finslerCopySource),expr);});
    latex.addEventListener("click",function(){if(captureSource(main))copyText(main.dataset.finslerCopySource,latex);});
    tools.appendChild(expr);tools.appendChild(latex);row.appendChild(tools);syncComponentTools(row);
  }
  function collectSectionSources(section){
    qa(".component-main",section).forEach(captureSource);
    qa(".section-summary .math-block,.section-summary .zero-summary,.section-summary .component-formula",section).forEach(captureSource);
    var out=[];
    qa("[data-finsler-copy-source]",section).forEach(function(n){if(n.dataset.finslerCopySource)out.push(n.dataset.finslerCopySource);});
    return out;
  }
  function setExpanded(section,open){
    qa(".expression-toggle",section).forEach(function(button){var isOpen=button.getAttribute("aria-expanded")==="true";if(open!==isOpen)button.click();});
  }
  function addSectionTools(section){
    if(!section||section.dataset.finslerSectionTools==="1")return;
    var heading=section.querySelector(".result-heading");if(!heading)return;
    section.dataset.finslerSectionTools="1";
    var tools=document.createElement("div");tools.className="finsler-section-tools";tools.setAttribute("role","toolbar");tools.setAttribute("aria-label","Result actions");
    var copy=document.createElement("button");copy.type="button";copy.textContent="Copy section";copy.title="Copies all formulas in this result; long formulas are expanded first";copy.addEventListener("click",function(){setExpanded(section,true);requestAnimationFrame(function(){scan(section);var items=collectSectionSources(section);copyText(items.join("\n"),copy);});});
    var expand=document.createElement("button");expand.type="button";expand.textContent="Expand all";expand.addEventListener("click",function(){setExpanded(section,true);});
    var collapse=document.createElement("button");collapse.type="button";collapse.textContent="Collapse all";collapse.addEventListener("click",function(){setExpanded(section,false);});
    tools.appendChild(copy);tools.appendChild(expand);tools.appendChild(collapse);heading.appendChild(tools);
  }
  function scan(root){
    if(!root)return;
    if(root.matches&&root.matches(".component-main"))captureSource(root);
    qa(".component-main",root).forEach(captureSource);
    if(root.matches&&root.matches(".component-row"))addComponentTools(root);
    qa(".component-row",root).forEach(addComponentTools);
    if(root.matches&&root.matches(".result-card"))addSectionTools(root);
    qa(".result-card",root).forEach(addSectionTools);
  }
  function styles(){
    if(document.getElementById("finsler-copy-styles"))return;
    var s=document.createElement("style");s.id="finsler-copy-styles";
    s.textContent='.finsler-component-tools,.finsler-section-tools{display:flex;gap:.35rem;flex-wrap:wrap}.finsler-component-tools{margin-left:auto;padding-left:.5rem;opacity:.28;transition:opacity .15s}.component-row:hover .finsler-component-tools,.finsler-component-tools:focus-within{opacity:1}.finsler-component-tools button,.finsler-section-tools button{appearance:none;border:1px solid rgba(67,76,94,.22);background:#fff;border-radius:.45rem;padding:.28rem .48rem;font:inherit;font-size:.72rem;line-height:1.2;color:#4b5563;cursor:pointer}.finsler-component-tools button:hover,.finsler-section-tools button:hover{border-color:rgba(67,76,94,.42);color:#111827}.finsler-component-tools button:disabled{opacity:.48;cursor:not-allowed}.finsler-section-tools{justify-content:flex-end;align-items:center;margin-left:auto}.result-heading>.finsler-section-tools{align-self:flex-start}@media(max-width:700px){.finsler-component-tools{opacity:1;width:100%;margin:.35rem 0 0;padding:0}.finsler-section-tools{width:100%;justify-content:flex-start;margin:.45rem 0 0}.result-heading{flex-wrap:wrap}}';
    document.head.appendChild(s);
  }
  function init(){
    styles();var results=document.getElementById("results");if(!results)return;scan(results);
    new MutationObserver(function(records){records.forEach(function(record){Array.prototype.forEach.call(record.addedNodes,function(node){if(node.nodeType===1)scan(node);});});requestAnimationFrame(function(){scan(results);});}).observe(results,{childList:true,subtree:true});
    window.FINSLER_RESULT_TOOLS={copyText:copyText,collectSectionSources:collectSectionSources,setExpanded:setExpanded,captureSource:captureSource};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();