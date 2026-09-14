(function(){
  "use strict";

  var NativeWorker = window.Worker;
  if (!NativeWorker || NativeWorker.__finslerTimingWrapped) return;

  function fmt(ms){
    if(ms < 1000) return ms.toFixed(0) + " ms";
    if(ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + " s";
    return Math.floor(ms / 60000) + "m " + ((ms % 60000) / 1000).toFixed(1) + "s";
  }

  function addTimingRow(label, elapsed){
    var log = document.getElementById("timing-log");
    if(!log || !label) return;
    var row = document.createElement("div");
    row.className = "timing-row timing-row-internal";
    row.textContent = label + " · " + fmt(elapsed) + " (internal)";
    log.appendChild(row);
  }

  function WrappedWorker(){
    var args = Array.prototype.slice.call(arguments);
    var worker = new (Function.prototype.bind.apply(NativeWorker, [null].concat(args)))();
    var active = null;

    worker.addEventListener("message", function(event){
      var msg = event.data || {};
      var now = performance.now();

      if(msg.type === "stepStart"){
        if(active && !active.hadVisibleComponent){
          addTimingRow(active.label, now - active.started);
        }
        active = {label: msg.label || "Internal step", started: now, hadVisibleComponent: false};
        return;
      }

      if(msg.type === "component"){
        if(active) active.hadVisibleComponent = true;
        return;
      }

      if(msg.type === "done" || msg.type === "error"){
        if(active && !active.hadVisibleComponent){
          addTimingRow(active.label, now - active.started);
        }
        active = null;
      }
    });

    return worker;
  }

  WrappedWorker.prototype = NativeWorker.prototype;
  Object.setPrototypeOf(WrappedWorker, NativeWorker);
  WrappedWorker.__finslerTimingWrapped = true;
  window.Worker = WrappedWorker;
})();
