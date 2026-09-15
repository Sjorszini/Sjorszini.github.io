(function(){
  "use strict";
  var stamp=Date.now().toString(36);
  function load(src,done){
    var s=document.createElement("script");
    s.src=src+(src.indexOf("?")===-1?"?":"&")+"enh="+stamp;
    s.async=false;
    s.onload=function(){if(done)done();};
    s.onerror=function(){if(window.console&&console.error)console.error("Failed to load Finsler enhancement script:",src);if(done)done();};
    document.head.appendChild(s);
  }
  load("finsler-ui-v6-fixes-core.js",function(){load("finsler-enhancements-v1.js");});
})();