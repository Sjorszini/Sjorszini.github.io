(function(){
  "use strict";

  function formatElapsed(ms){
    return ms<1000?Math.max(0,Math.round(ms))+" ms":(ms/1000).toFixed(ms<10000?1:0)+" s";
  }
  function timingNode(){return document.getElementById("calculationTime");}
  function clearTiming(){var node=timingNode();if(!node)return;node.textContent="";node.hidden=true;}
  function showTiming(ms,running){var node=timingNode();if(!node)return;node.hidden=false;node.textContent=formatElapsed(ms)+(running?" elapsed":"");}

  if(!window.Worker||window.Worker.__riemannianPerformancePatched){clearTiming();return;}
  var BaseWorker=window.Worker;
  function PerformanceWorker(url,options){
    var target=String(url);
    if(/(?:^|\/)riemannian-worker\.js(?:\?v=\d+)?$/.test(target))target="riemannian-worker-polish.js?v=1";
    var instance=new BaseWorker(target,options),started=0,timer=null;
    var nativePost=instance.postMessage.bind(instance),nativeTerminate=instance.terminate.bind(instance);

    function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
    function startTimer(){
      stopTimer();started=performance.now();showTiming(0,true);
      timer=setInterval(function(){showTiming(performance.now()-started,true);},100);
    }

    instance.postMessage=function(message,transfer){
      if(message&&message.type==="calculate"){
        window.__riemannianLastPayload=message;
        window.__riemannianLastResult=null;
        startTimer();
      }
      if(arguments.length>1)return nativePost(message,transfer);
      return nativePost(message);
    };
    instance.terminate=function(){stopTimer();clearTiming();return nativeTerminate();};
    instance.addEventListener("message",function(event){
      var data=event.data||{};
      if(data.type==="result")window.__riemannianLastResult=data.result||null;
      if(data.type==="done"){
        stopTimer();
        var wall=started?performance.now()-started:Number(data.elapsedMs)||0;
        if(data&&typeof data==="object")data.elapsedMs=wall;
        showTiming(wall,false);
      }else if(data.type==="error"){
        stopTimer();clearTiming();
      }
    });
    instance.addEventListener("error",function(){stopTimer();clearTiming();});
    return instance;
  }
  PerformanceWorker.prototype=BaseWorker.prototype;
  Object.setPrototypeOf(PerformanceWorker,BaseWorker);
  PerformanceWorker.__riemannianPrettyPatched=true;
  PerformanceWorker.__riemannianPerformancePatched=true;
  window.Worker=PerformanceWorker;
  clearTiming();
})();
