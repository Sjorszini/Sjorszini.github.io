(function(){
  "use strict";
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function syncMain(main){
    if(!main||!window.FINSLER_DISPLAY_PREFS||typeof window.FINSLER_DISPLAY_PREFS.transformSource!=="function")return;
    if(main.dataset.finslerCopySource&&!main.dataset.finslerDisplayBase)main.dataset.finslerDisplayBase=main.dataset.finslerCopySource;
    if(main.dataset.finslerDisplayBase)main.dataset.finslerCopySource=window.FINSLER_DISPLAY_PREFS.transformSource(main.dataset.finslerDisplayBase);
  }
  function sync(root){
    if(!root)return;
    var main=root.matches&&root.matches('.component-main')?root:(root.closest&&root.closest('.component-main'));
    if(main)syncMain(main);
    qa('.component-main',root).forEach(syncMain);
  }
  function init(){
    var results=document.getElementById('results');if(!results)return;sync(results);
    new MutationObserver(function(records){records.forEach(function(record){Array.prototype.forEach.call(record.addedNodes,function(node){if(node.nodeType===1)sync(node);});});requestAnimationFrame(function(){sync(results);});}).observe(results,{childList:true,subtree:true});
    window.FINSLER_DISPLAY_COPY_SYNC={sync:sync};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();