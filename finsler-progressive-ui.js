(function(){
  "use strict";

  var worker=null, liveTimer=null, liveStart=0, liveLabel="", runToken=0;
  var activeOutputs=Object.create(null), activeWorkerSection=null;
  var COMPONENT_COLLAPSE_THRESHOLD=340;
  var SUMMARY_COLLAPSE_THRESHOLD=900;

  function el(id){ return document.getElementById(id); }
  function fmt(ms){ if(ms<1000) return ms.toFixed(0)+" ms"; if(ms<60000) return (ms/1000).toFixed(ms<10000?2:1)+" s"; return Math.floor(ms/60000)+"m "+((ms%60000)/1000).toFixed(1)+"s"; }
  function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;"); }
  function tex(expr){ try { return math.parse(expr).toTex({parenthesis:"keep"}).replace(/\bx(\d+)\b/g,"x_{$1}").replace(/\by(\d+)\b/g,"y_{$1}"); } catch(e){ return "\\text{"+escapeHtml(expr).replace(/[{}]/g,"")+"}"; } }
  function typeset(node){ if(window.MathJax&&window.MathJax.typesetPromise) return window.MathJax.typesetPromise([node]).catch(function(){}); return Promise.resolve(); }
  function setStatus(text,type){ var s=el("status"); if(!s) return; s.textContent=text; s.className="calc-status"+(type?" is-"+type:""); }
  function setBusy(on){
    ["computeConnection","computeCurvature","loadExample","selectAllOutputs","clearAllOutputs"].forEach(function(id){ var n=el(id); if(n) n.disabled=on; });
    document.querySelectorAll("[data-output]").forEach(function(n){ n.disabled=on; });
  }
  function stopLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer=null; } }
  function startLive(label){ stopLive(); liveLabel=label; liveStart=performance.now(); updateLive(); liveTimer=setInterval(updateLive,100); }
  function updateLive(){ var n=el("live-step"); if(n) n.textContent=liveLabel+" — "+fmt(performance.now()-liveStart)+" elapsed"; }

  function outputKeyForSection(section){
    var map={
      homogeneity:"geometry", classification:"geometry",
      metric:"metric", inverse:"inverse", cartan:"cartan",
      spray:"spray", nonlinear:"nonlinear",
      christoffel:"connections", berwald:"connections", chern:"connections",
      curvature:"curvature", deviation:"deviation", ricci:"ricci",
      affineCurvature:"affine", affineRicci:"affine"
    };
    return map[section]||section;
  }
  function wantsSection(section){ var key=outputKeyForSection(section); return activeOutputs[key]!==false; }
  function collectOutputs(){
    var out=Object.create(null);
    document.querySelectorAll("[data-output]").forEach(function(n){ out[n.getAttribute("data-output")]=!!n.checked; });
    return out;
  }
  function setAllOutputs(value){ document.querySelectorAll("[data-output]").forEach(function(n){ n.checked=value; }); }

  function prepareResults(){
    var r=el("results");
    r.innerHTML='<section class="result-card calculation-progress" id="calculation-progress"><div class="result-card-header"><h2>Calculation progress</h2><span class="result-meta" id="path-label">starting…</span></div><p id="live-step" class="live-step">Preparing calculation…</p><div id="timing-log" class="timing-log"></div></section><div id="progressive-sections" class="results-stack"></div>';
    return r;
  }
  function ensureSection(key,title,meta){
    var id="section-"+key, n=el(id);
    if(n) return n;
    n=document.createElement("section");
    n.id=id;
    n.className="result-card progressive-result";
    n.innerHTML='<div class="result-card-header"><h2>'+escapeHtml(title)+'</h2><span class="result-meta" data-time>working…</span></div><p class="result-note">'+escapeHtml(meta||"")+'</p><div class="component-list" data-components></div><div class="section-summary" data-summary></div>';
    el("progressive-sections").appendChild(n);
    return n;
  }
  function logTiming(text){ var log=el("timing-log"); if(!log) return; var p=document.createElement("div"); p.className="timing-log-row"; p.textContent=text; log.appendChild(p); }

  function buildExpandableMath(host,label,value,threshold){
    var rawValue=String(value), size=rawValue.length;
    if(size<=threshold){
      host.innerHTML='<div class="component-formula">\\['+label+'='+tex(rawValue)+'\\]</div>';
      typeset(host);
      return;
    }

    host.innerHTML='<div class="large-expression-shell"><div class="large-expression-info"><strong class="large-expression-label">\\('+label+'\\)</strong> — large expression hidden ('+size.toLocaleString()+ ' characters)</div><button type="button" class="expression-toggle" aria-expanded="false">Expand</button></div><div class="expanded-expression" hidden></div>';
    var shell=host.querySelector(".large-expression-shell"), expanded=host.querySelector(".expanded-expression"), button=host.querySelector(".expression-toggle"), rendered=false;
    typeset(shell);
    button.addEventListener("click",function(){
      var open=button.getAttribute("aria-expanded")==="true";
      if(open){
        expanded.hidden=true;
        button.setAttribute("aria-expanded","false");
        button.textContent="Expand";
        return;
      }
      if(!rendered){
        expanded.innerHTML='<div class="math-block">\\['+label+'='+tex(rawValue)+'\\]</div>';
        rendered=true;
        typeset(expanded);
      }
      expanded.hidden=false;
      button.setAttribute("aria-expanded","true");
      button.textContent="Collapse";
    });
  }

  function appendComponent(msg){
    var sec=el("section-"+msg.section); if(!sec) return;
    var list=sec.querySelector("[data-components]");
    var row=document.createElement("div");
    row.className="component-row timed-component";
    var formula=document.createElement("div"); formula.className="component-formula-host";
    var timing=document.createElement("span"); timing.className="component-time"; timing.textContent=fmt(msg.elapsedMs);
    row.appendChild(formula); row.appendChild(timing); list.appendChild(row);
    buildExpandableMath(formula,msg.label,msg.value,COMPONENT_COLLAPSE_THRESHOLD);
  }

  function matrixRawSize(matrix){
    var total=0;
    for(var i=0;i<matrix.length;i++) for(var j=0;j<matrix[i].length;j++) total+=String(matrix[i][j]).length;
    return total;
  }
  function addMatrixSummary(box,matrix){
    var size=matrixRawSize(matrix);
    if(size<=SUMMARY_COLLAPSE_THRESHOLD){
      var rows=matrix.map(function(row){ return row.map(tex).join(" & "); });
      var block=document.createElement("div"); block.className="math-block"; block.innerHTML='\\[\\begin{pmatrix}'+rows.join(" \\\\ ")+'\\end{pmatrix}\\]'; box.appendChild(block); typeset(block); return;
    }
    var wrap=document.createElement("div"); wrap.className="summary-expandable";
    wrap.innerHTML='<div class="large-expression-shell"><div class="large-expression-info"><strong>Completed matrix</strong> — full matrix hidden ('+size.toLocaleString()+' expression characters)</div><button type="button" class="expression-toggle" aria-expanded="false">Expand</button></div><div class="expanded-expression" hidden></div>';
    box.appendChild(wrap);
    var button=wrap.querySelector(".expression-toggle"), expanded=wrap.querySelector(".expanded-expression"), rendered=false;
    button.addEventListener("click",function(){
      var open=button.getAttribute("aria-expanded")==="true";
      if(open){ expanded.hidden=true; button.setAttribute("aria-expanded","false"); button.textContent="Expand"; return; }
      if(!rendered){
        var rows=matrix.map(function(row){ return row.map(tex).join(" & "); });
        expanded.innerHTML='<div class="math-block">\\[\\begin{pmatrix}'+rows.join(" \\\\ ")+'\\end{pmatrix}\\]</div>';
        rendered=true; typeset(expanded);
      }
      expanded.hidden=false; button.setAttribute("aria-expanded","true"); button.textContent="Collapse";
    });
  }
  function addScalarSummary(box,label,value){
    var host=document.createElement("div"); host.className="summary-expandable"; box.appendChild(host);
    buildExpandableMath(host,label,value,SUMMARY_COLLAPSE_THRESHOLD);
  }
  function renderSummary(sec,summary){
    if(!summary) return;
    var box=sec.querySelector("[data-summary]");
    if(summary.matrix) addMatrixSummary(box,summary.matrix);
    if(summary.det) addScalarSummary(box,"\\det(g)",summary.det);
    if(summary.homogeneous!==undefined){ box.innerHTML+='<p class="result-note">2-homogeneity: <strong>'+(summary.homogeneous?'verified symbolically':'residual did not simplify to zero')+'</strong>.</p>'; }
    if(summary.riemannian!==undefined){ box.innerHTML+='<p class="result-note">Detected geometry: <strong>'+(summary.riemannian?'quadratic / Riemannian':(summary.randers?'2D Randers':'general Finsler'))+'</strong>.</p>'; }
  }

  function handleMessage(e,token){
    if(token!==runToken) return;
    var m=e.data||{};
    if(m.type==="path"){ var p=el("path-label"); if(p) p.textContent=m.path; return; }
    if(m.type==="sectionStart"){
      activeWorkerSection=m.section;
      if(wantsSection(m.section)) ensureSection(m.section,m.title,m.meta);
      return;
    }
    if(m.type==="stepStart"){
      startLive(m.label);
      setStatus(m.label+"…","working");
      return;
    }
    if(m.type==="component"){
      if(wantsSection(m.section)){
        appendComponent(m);
        logTiming(m.label+" — "+fmt(m.elapsedMs));
      }
      return;
    }
    if(m.type==="sectionComplete"){
      if(wantsSection(m.section)){
        var sec=el("section-"+m.section);
        if(sec){ var t=sec.querySelector("[data-time]"); if(t) t.textContent="completed in "+fmt(m.elapsedMs); renderSummary(sec,m.summary); }
        logTiming((sec&&sec.querySelector("h2")?sec.querySelector("h2").textContent:m.section)+" completed — "+fmt(m.elapsedMs));
      }
      return;
    }
    if(m.type==="done"){
      stopLive(); var live=el("live-step"); if(live) live.textContent="Calculation complete — total "+fmt(m.totalMs);
      setStatus("Calculation complete in "+fmt(m.totalMs)+".","success"); setBusy(false); return;
    }
    if(m.type==="error"){
      stopLive(); setStatus(m.message||"Calculation failed.","error"); var live2=el("live-step"); if(live2) live2.textContent="Stopped: "+(m.message||"error"); setBusy(false); return;
    }
  }

  function run(mode,event){
    if(event){ event.preventDefault(); event.stopImmediatePropagation(); }
    var n=Number(el("dimension").value), L=el("lagrangian").value.trim();
    if(!L){ setStatus("Enter a Finsler Lagrangian first.","error"); return; }
    try{ math.parse(L); }catch(error){ setStatus(error.message||String(error),"error"); return; }
    activeOutputs=collectOutputs();
    if(worker) worker.terminate();
    worker=new Worker("finsler-progressive-worker.js?v=1"); runToken+=1; var token=runToken;
    activeWorkerSection=null; prepareResults(); setBusy(true); setStatus("Starting symbolic calculation…","working"); startLive("Starting worker");
    worker.onmessage=function(e){ handleMessage(e,token); };
    worker.onerror=function(e){ if(token!==runToken) return; stopLive(); setBusy(false); setStatus("Worker error: "+(e.message||"unknown error"),"error"); };
    worker.postMessage({type:"calculate",mode:mode,n:n,L:L,outputs:activeOutputs});
  }

  function loadExample(){
    var v=el("exampleSelect").value;
    if(v==="randers"){ el("dimension").value="2"; el("lagrangian").value="(sqrt(exp(2*x1)*y1^2 + y2^2) + 0.18*y2)^2"; }
    else if(v==="riemann2"){ el("dimension").value="2"; el("lagrangian").value="(1 + x1^2)*y1^2 + exp(2*x1)*y2^2"; }
    else if(v==="minkowski4"){ el("dimension").value="4"; el("lagrangian").value="-y1^2 + y2^2 + y3^2 + y4^2"; }
    if(worker){ worker.terminate(); worker=null; }
    stopLive(); el("results").innerHTML=""; setBusy(false); setStatus("Example loaded.","");
  }
  function clear(){ if(worker){ worker.terminate(); worker=null; } runToken+=1; stopLive(); el("results").innerHTML=""; setBusy(false); setStatus("Ready.",""); }
  function init(){
    el("computeConnection").addEventListener("click",function(e){run("connection",e);},true);
    el("computeCurvature").addEventListener("click",function(e){run("curvature",e);},true);
    el("loadExample").addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();loadExample();},true);
    el("clearResults").addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();clear();},true);
    el("selectAllOutputs").addEventListener("click",function(){setAllOutputs(true);});
    el("clearAllOutputs").addEventListener("click",function(){setAllOutputs(false);});
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
