(function(){
  "use strict";
  var modules=["finsler-enhancement-01-validation.js","finsler-enhancement-02-dependencies.js","finsler-enhancement-03-result-tools.js"];
  var stamp=Date.now().toString(36),i=0;
  function next(){
    if(i>=modules.length)return;
    var src=modules[i++],s=document.createElement("script");
    s.src=src+"?enh="+stamp;
    s.async=false;
    s.onload=next;
    s.onerror=function(){if(window.console&&console.error)console.error("Failed to load Finsler enhancement module:",src);next();};
    document.head.appendChild(s);
  }
  next();
})();