(function(){
  "use strict";
  var BaseWorker=window.Worker,activeWorker=null,activeUrl="";
  if(BaseWorker&&!BaseWorker.__finslerCancelable){
    function TrackingWorker(url,options){
      var w=new BaseWorker(url,options);
      if(String(url||"").indexOf("finsler-worker")!==-1){activeWorker=w;activeUrl=String(url||"");window.FINSLER_ACTIVE_WORKER=w;}
      return w;
    }
    TrackingWorker.prototype=BaseWorker.prototype;
    TrackingWorker.__finslerCancelable=true;
    TrackingWorker.__finslerBase=BaseWorker;
    window.Worker=TrackingWorker;
  }
  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function busy(){var shell=el("calculator-shell");return !!(shell&&shell.classList.contains("is-busy"));}
  function syncButton(){var b=el("cancelCalculationEnhanced");if(!b)return;var on=busy();b.hidden=!on;b.disabled=!on;}
  function fallbackUnlock(){
    var shell=el("calculator-shell");if(!shell)return;
    qa("button,input,select,textarea",shell).forEach(function(n){n.disabled=false;});
    shell.classList.remove("is-busy");
    var status=el("status");if(status){status.textContent="Calculation cancelled.";status.className="calc-status";}
    var live=el("live-step");if(live)live.textContent="Cancelled";
  }
  function cancel(){
    if(!busy())return;
    var w=activeWorker||window.FINSLER_ACTIVE_WORKER;
    var callback=w&&w.onmessage;
    if(w&&typeof w.terminate==="function")try{w.terminate();}catch(e){}
    activeWorker=null;window.FINSLER_ACTIVE_WORKER=null;
    if(typeof callback==="function"){
      try{callback({data:{type:"error",message:"Calculation cancelled."}});}catch(e){fallbackUnlock();}
      setTimeout(function(){var status=el("status");if(status){status.textContent="Calculation cancelled.";status.className="calc-status";}var live=el("live-step");if(live)live.textContent="Cancelled";syncButton();},0);
    }else fallbackUnlock();
  }
  function init(){
    var panel=document.querySelector(".calculate-panel"),clear=el("clearResults");if(!panel)return;
    var b=document.createElement("button");b.type="button";b.id="cancelCalculationEnhanced";b.className="utility-button finsler-cancel-button";b.textContent="Cancel calculation";b.hidden=true;b.disabled=true;
    b.addEventListener("click",cancel);
    if(clear)panel.insertBefore(b,clear);else panel.appendChild(b);
    var shell=el("calculator-shell");if(shell)new MutationObserver(syncButton).observe(shell,{attributes:true,attributeFilter:["class"]});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&busy()&&!e.defaultPrevented){e.preventDefault();cancel();}});
    var style=document.createElement("style");style.id="finsler-cancel-styles";style.textContent='.finsler-cancel-button{border-color:rgba(180,35,24,.3)!important;color:#9b2c24!important}.finsler-cancel-button:hover{border-color:rgba(180,35,24,.55)!important;background:#fff7f6!important}.finsler-cancel-button[hidden]{display:none!important}';document.head.appendChild(style);
    syncButton();window.FINSLER_CANCEL_API={cancel:cancel,activeUrl:function(){return activeUrl;}};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();