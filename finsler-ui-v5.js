(function(){
  "use strict";

  var worker=null, liveTimer=null, liveStart=0, liveLabel="", runToken=0;
  var activeOutputs=Object.create(null);
  var COMPONENT_COLLAPSE_THRESHOLD=360;
  var SUMMARY_COLLAPSE_THRESHOLD=1000;

  function el(id){ return document.getElementById(id); }
  function qa(selector,root){ return Array.prototype.slice.call((root||document).querySelectorAll(selector)); }
  function fmt(ms){ if(ms<1000) return ms.toFixed(0)+" ms"; if(ms<60000) return (ms/1000).toFixed(ms<10000?2:1)+" s"; return Math.floor(ms/60000)+"m "+((ms%60000)/1000).toFixed(1)+"s"; }
  function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function tex(expr){ try { return math.parse(expr).toTex({parenthesis:"keep"}).replace(/\bx(\d+)\b/g,"x_{$1}").replace(/\by(\d+)\b/g,"y_{$1}"); } catch(e){ return "\\text{"+escapeHtml(expr).replace(/[{}]/g,"")+"}"; } }
  function typeset(node){ if(window.MathJax&&window.MathJax.typesetPromise) return window.MathJax.typesetPromise([node]).catch(function(){}); return Promise.resolve(); }
  function setStatus(text,type){ var n=el("status"); if(!n) return; n.textContent=text; n.className="calc-status"+(type?" is-"+type:""); }
  function stopLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer=null; } }
  function startLive(label){ stopLive(); liveLabel=label; liveStart=performance.now(); updateLive(); liveTimer=setInterval(updateLive,100); }
  function updateLive(){ var n=el("live-step"); if(n) n.textContent=liveLabel+" · "+fmt(performance.now()-liveStart); }
  function setBusy(on){
    qa("button, input, select, textarea",el("calculator-shell")).forEach(function(n){
      if(n.id==="clearResults") return;
      if(n.closest("#results")) return;
      n.disabled=on;
    });
    if(el("clearResults")) el("clearResults").disabled=false;
    el("calculator-shell").classList.toggle("is-busy",on);
  }

  function currentInputMode(){ var n=document.querySelector('input[name="inputMode"]:checked'); return n?n.value:"lagrangian"; }
  function currentGeometryMode(){ var n=document.querySelector('input[name="geometryMode"]:checked'); return n?n.value:"riemannian"; }
  function dimension(){ return Number(el("dimension").value); }

  function snapshotMatrix(){
    var out=[]; qa(".metric-entry",el("metricGrid")).forEach(function(cell){ var i=Number(cell.dataset.i),j=Number(cell.dataset.j); if(!out[i]) out[i]=[]; out[i][j]=cell.value; }); return out;
  }
  function snapshotOneForm(){
    var out=[]; qa(".oneform-entry",el("oneFormGrid")).forEach(function(cell){ out[Number(cell.dataset.i)]=cell.value; }); return out;
  }
  function collectGridValues(){
    var n=dimension(), out=[];
    for(var i=0;i<n;i++){
      out[i]=[];
      for(var j=0;j<n;j++){
        var cell=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');
        out[i][j]=cell?cell.value:"0";
      }
    }
    return out;
  }
  function collectOneForm(){
    var n=dimension(), out=[];
    for(var i=0;i<n;i++){
      var cell=document.querySelector('.oneform-entry[data-i="'+i+'"]'); out[i]=cell?cell.value:"0";
    }
    return out;
  }
  function resizeMatrix(values){
    var n=dimension(), host=el("metricGrid"), old=values||[];
    host.innerHTML="";
    host.style.setProperty("--matrix-n",String(n));
    var blank=document.createElement("div"); blank.className="matrix-corner"; host.appendChild(blank);
    for(var c=0;c<n;c++){ var h=document.createElement("div"); h.className="matrix-axis"; h.textContent=String(c+1); host.appendChild(h); }
    for(var i=0;i<n;i++){
      var rh=document.createElement("div"); rh.className="matrix-axis"; rh.textContent=String(i+1); host.appendChild(rh);
      for(var j=0;j<n;j++){
        var wrap=document.createElement("label"); wrap.className="matrix-cell";
        var input=document.createElement("input"); input.type="text"; input.className="metric-entry"; input.dataset.i=String(i); input.dataset.j=String(j);
        input.value=(old[i]&&old[i][j]!==undefined)?old[i][j]:(i===j?"1":"0");
        input.autocomplete="off"; input.spellcheck=false; input.setAttribute("aria-label","g"+(i+1)+(j+1));
        var sub=document.createElement("span"); sub.textContent="g"+(i+1)+(j+1); wrap.appendChild(input); wrap.appendChild(sub); host.appendChild(wrap);
      }
    }
    qa(".metric-entry",host).forEach(function(input){
      input.addEventListener("input",function(){
        var i=Number(input.dataset.i), j=Number(input.dataset.j);
        if(i===j) return;
        var mirror=host.querySelector('.metric-entry[data-i="'+j+'"][data-j="'+i+'"]');
        if(mirror && mirror.value!==input.value) mirror.value=input.value;
      });
      input.addEventListener("focus",function(){ input.select(); });
    });
  }
  function resizeOneForm(values){
    var n=dimension(), host=el("oneFormGrid"), old=values||[]; host.innerHTML=""; host.style.setProperty("--vector-n",String(n));
    for(var i=0;i<n;i++){
      var wrap=document.createElement("label"); wrap.className="oneform-cell";
      var tag=document.createElement("span"); tag.innerHTML="b<sub>"+(i+1)+"</sub>";
      var input=document.createElement("input"); input.type="text"; input.className="oneform-entry"; input.dataset.i=String(i); input.value=old[i]!==undefined?old[i]:"0"; input.autocomplete="off"; input.spellcheck=false;
      wrap.appendChild(tag); wrap.appendChild(input); host.appendChild(wrap);
      input.addEventListener("focus",function(){ this.select(); });
    }
  }
  function setMatrix(values){ resizeMatrix(values); }
  function setOneForm(values){ resizeOneForm(values); }

  function updateMode(){
    var metric=currentInputMode()==="metric";
    el("lagrangianInputPanel").hidden=metric;
    el("metricInputPanel").hidden=!metric;
    el("metricOutputLabel").textContent=metric?"Metric / fundamental tensor":"Fundamental tensor";
    updateAlphaBetaVisibility();
  }
  function updateAlphaBetaVisibility(){
    var show=currentInputMode()==="metric" && currentGeometryMode()==="alphabeta";
    el("alphaBetaPanel").hidden=!show;
    el("plainMetricHint").hidden=show || currentInputMode()!=="metric";
    updateMVisibility(); updateFormulaPreview();
  }
  function updateMVisibility(){ el("mParameterWrap").hidden=el("alphaBetaType").value!=="mkropina"; }
  function updateFormulaPreview(){
    var type=el("alphaBetaType").value, formula;
    if(type==="randers") formula="F=\\alpha+\\beta";
    else if(type==="kropina") formula="F=\\frac{\\alpha^2}{\\beta}";
    else if(type==="mkropina") formula="F=\\alpha^{1+m}\\beta^{-m}";
    else formula="F=\\frac{\\alpha^2}{\\alpha-\\beta}";
    el("alphaBetaFormula").innerHTML="\\["+formula+"\\]"; typeset(el("alphaBetaFormula"));
  }

  function collectOutputs(){ var out=Object.create(null); qa("[data-output]").forEach(function(n){ out[n.dataset.output]=!!n.checked; }); return out; }
  function setAllOutputs(value){ qa("[data-output]").forEach(function(n){ n.checked=value; }); updateSelectionCount(); }
  function selectEssentials(){
    var keys={metric:true,inverse:true,spray:true,nonlinear:true,connections:true,curvature:true,ricci:true};
    qa("[data-output]").forEach(function(n){ n.checked=!!keys[n.dataset.output]; }); updateSelectionCount();
  }
  function updateSelectionCount(){ var c=qa("[data-output]:checked").length; el("selectionCount").textContent=c+" selected"; }

  function prepareResults(){
    var r=el("results");
    r.innerHTML='<section class="progress-card" id="calculation-progress"><div class="progress-top"><div><span class="section-kicker">Calculation</span><h2>Progress</h2></div><span class="path-pill" id="path-label">Starting…</span></div><div class="live-step" id="live-step">Preparing symbolic engine…</div><details class="timing-details"><summary>Timing log</summary><div id="timing-log" class="timing-log"></div></details></section><div id="progressive-sections" class="results-stack"></div>';
    r.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function ensureSection(key,title,meta){
    var id="section-"+key, n=el(id); if(n) return n;
    n=document.createElement("section"); n.id=id; n.className="result-card progressive-result";
    n.innerHTML='<div class="result-heading"><div><span class="section-kicker">Result</span><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(meta||"")+'</p></div><span class="result-meta" data-time>Working…</span></div><div class="component-list" data-components></div><div class="section-summary" data-summary></div>';
    el("progressive-sections").appendChild(n); return n;
  }
  function logTiming(text){ var log=el("timing-log"); if(!log) return; var row=document.createElement("div"); row.className="timing-row"; row.textContent=text; log.appendChild(row); }

  function buildExpandableMath(host,label,value,threshold){
    var rawValue=String(value), size=rawValue.length;
    if(size<=threshold){ host.innerHTML='<div class="component-formula">\\['+label+'='+tex(rawValue)+'\\]</div>'; typeset(host); return; }
    host.innerHTML='<div class="expression-summary"><div><strong>\\('+label+'\\)</strong><span>'+size.toLocaleString()+' characters · simplified result hidden</span></div><button type="button" class="expression-toggle" aria-expanded="false">Expand</button></div><div class="expanded-expression" hidden></div>';
    var summary=host.querySelector(".expression-summary"), expanded=host.querySelector(".expanded-expression"), button=host.querySelector(".expression-toggle"), rendered=false; typeset(summary);
    button.addEventListener("click",function(){
      var open=button.getAttribute("aria-expanded")==="true";
      if(open){ expanded.hidden=true; button.setAttribute("aria-expanded","false"); button.textContent="Expand"; return; }
      if(!rendered){ expanded.innerHTML='<div class="math-block">\\['+label+'='+tex(rawValue)+'\\]</div>'; rendered=true; typeset(expanded); }
      expanded.hidden=false; button.setAttribute("aria-expanded","true"); button.textContent="Collapse";
    });
  }
  function appendComponent(msg){
    var sec=el("section-"+msg.section); if(!sec) return;
    var row=document.createElement("div"); row.className="component-row";
    var host=document.createElement("div"); host.className="component-main";
    var timing=document.createElement("span"); timing.className="component-time"; timing.textContent=fmt(msg.elapsedMs);
    row.appendChild(host); row.appendChild(timing); sec.querySelector("[data-components]").appendChild(row);
    buildExpandableMath(host,msg.label,msg.value,COMPONENT_COLLAPSE_THRESHOLD);
  }
  function matrixSize(matrix){ var t=0; for(var i=0;i<matrix.length;i++) for(var j=0;j<matrix[i].length;j++) t+=String(matrix[i][j]).length; return t; }
  function addMatrixSummary(box,matrix){
    var size=matrixSize(matrix), wrap=document.createElement("div"); wrap.className="matrix-summary";
    if(size<=SUMMARY_COLLAPSE_THRESHOLD){ var rows=matrix.map(function(r){ return r.map(tex).join(" & "); }); wrap.innerHTML='<div class="math-block">\\[\\begin{pmatrix}'+rows.join(" \\\\ ")+'\\end{pmatrix}\\]</div>'; box.appendChild(wrap); typeset(wrap); return; }
    wrap.innerHTML='<div class="expression-summary"><div><strong>Completed matrix</strong><span>'+size.toLocaleString()+' expression characters</span></div><button type="button" class="expression-toggle" aria-expanded="false">Expand matrix</button></div><div class="expanded-expression" hidden></div>'; box.appendChild(wrap);
    var button=wrap.querySelector("button"), expanded=wrap.querySelector(".expanded-expression"), rendered=false;
    button.addEventListener("click",function(){ var open=button.getAttribute("aria-expanded")==="true"; if(open){expanded.hidden=true;button.setAttribute("aria-expanded","false");button.textContent="Expand matrix";return;} if(!rendered){var rows=matrix.map(function(r){return r.map(tex).join(" & ");});expanded.innerHTML='<div class="math-block">\\[\\begin{pmatrix}'+rows.join(" \\\\ ")+'\\end{pmatrix}\\]</div>';rendered=true;typeset(expanded);} expanded.hidden=false;button.setAttribute("aria-expanded","true");button.textContent="Collapse matrix"; });
  }
  function renderSummary(sec,summary){ if(!summary) return; var box=sec.querySelector("[data-summary]"); if(summary.matrix) addMatrixSummary(box,summary.matrix); if(summary.det){ var h=document.createElement("div"); h.className="scalar-summary"; box.appendChild(h); buildExpandableMath(h,"\\det(g)",summary.det,SUMMARY_COLLAPSE_THRESHOLD); } }

  function handleMessage(e,token){
    if(token!==runToken) return; var m=e.data||{};
    if(m.type==="path"){ el("path-label").textContent=m.path; return; }
    if(m.type==="sectionStart"){ ensureSection(m.section,m.title,m.meta); return; }
    if(m.type==="stepStart"){ startLive(m.label); setStatus(m.label+"…","working"); return; }
    if(m.type==="component"){ appendComponent(m); logTiming(m.label+" · "+fmt(m.elapsedMs)); return; }
    if(m.type==="sectionComplete"){ var sec=el("section-"+m.section); if(sec){ var time=sec.querySelector("[data-time]"); if(time) time.textContent=fmt(m.elapsedMs); renderSummary(sec,m.summary); logTiming(sec.querySelector("h2").textContent+" completed · "+fmt(m.elapsedMs)); } return; }
    if(m.type==="done"){ stopLive(); el("live-step").textContent="Complete · total "+fmt(m.totalMs); setStatus("Calculation complete in "+fmt(m.totalMs)+".","success"); setBusy(false); return; }
    if(m.type==="error"){ stopLive(); var message=m.message||"Calculation failed."; setStatus(message,"error"); if(el("live-step")) el("live-step").textContent="Stopped · "+message; setBusy(false); return; }
  }

  function payload(){
    var n=dimension(), mode=currentInputMode(), out={n:n,inputType:mode,outputs:collectOutputs()};
    if(!Object.keys(out.outputs).some(function(k){return out.outputs[k];})) throw new Error("Select at least one quantity to calculate.");
    if(mode==="lagrangian"){
      out.L=el("lagrangian").value.trim(); if(!out.L) throw new Error("Enter a Finsler Lagrangian first."); math.parse(out.L);
    }else{
      out.metricEntries=collectGridValues();
      var ab=currentGeometryMode()==="alphabeta";
      out.alphaBeta={enabled:ab};
      if(ab){
        out.alphaBeta.type=el("alphaBetaType").value;
        out.alphaBeta.b=collectOneForm();
        out.alphaBeta.m=el("mParameter").value.trim();
      }
    }
    return out;
  }
  function run(event){
    if(event) event.preventDefault(); var data;
    try{ data=payload(); }catch(error){ setStatus(error.message||String(error),"error"); return; }
    activeOutputs=data.outputs; if(worker) worker.terminate();
    worker=new Worker("finsler-worker-v3.js?v=1"); runToken+=1; var token=runToken;
    prepareResults(); setBusy(true); setStatus("Starting symbolic calculation…","working"); startLive("Starting worker");
    worker.onmessage=function(e){ handleMessage(e,token); };
    worker.onerror=function(e){ if(token!==runToken) return; stopLive(); setBusy(false); setStatus("Worker error: "+(e.message||"unknown error"),"error"); };
    worker.postMessage({type:"calculate",n:data.n,inputType:data.inputType,L:data.L||"",metricEntries:data.metricEntries||null,alphaBeta:data.alphaBeta||null,outputs:data.outputs});
  }

  function cancelCalculation(){ if(worker){worker.terminate();worker=null;} runToken+=1; stopLive(); setBusy(false); }
  function clearResults(){ cancelCalculation(); el("results").innerHTML=""; setStatus("Ready.",""); }
  function setInputMode(value){ var r=document.querySelector('input[name="inputMode"][value="'+value+'"]'); if(r) r.checked=true; updateMode(); }
  function setGeometryMode(value){ var r=document.querySelector('input[name="geometryMode"][value="'+value+'"]'); if(r) r.checked=true; updateAlphaBetaVisibility(); }

  function loadExample(){
    cancelCalculation(); var v=el("exampleSelect").value;
    if(v==="randerspp"){
      el("dimension").value="4"; setInputMode("metric"); setGeometryMode("alphabeta");
      setMatrix([["x3^2 - x4^2","-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]]);
      setOneForm(["1","0","0","0"]); el("alphaBetaType").value="randers"; updateMVisibility(); updateFormulaPreview();
      el("exampleNote").textContent="Randers pp-wave: x1=u, x2=v, x3=x, x4=y; H=x3²−x4² and β=du.";
    }else if(v==="ppwaveMetric4"){
      el("dimension").value="4"; setInputMode("metric"); setGeometryMode("riemannian");
      setMatrix([["x3^2 - x4^2","-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]]);
      el("exampleNote").textContent="Brinkmann pp-wave metric with H=x3²−x4².";
    }else if(v==="mkropinaPP"){
      el("dimension").value="4"; setInputMode("metric"); setGeometryMode("alphabeta");
      setMatrix([["x3^2 - x4^2","-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]]);
      setOneForm(["1","0","0","0"]); el("alphaBetaType").value="mkropina"; el("mParameter").value="1"; updateMVisibility(); updateFormulaPreview();
      el("exampleNote").textContent="m-Kropina pp-wave with parallel null 1-form β=du; default m=1.";
    }else if(v==="riemann2"){
      el("dimension").value="2"; setInputMode("metric"); setGeometryMode("riemannian"); setMatrix([["1+x1^2","0"],["0","exp(2*x1)"]]);
      el("exampleNote").textContent="Two-dimensional positive-definite test metric.";
    }else if(v==="minkowski4"){
      el("dimension").value="4"; setInputMode("metric"); setGeometryMode("riemannian"); setMatrix([["-1","0","0","0"],["0","1","0","0"],["0","0","1","0"],["0","0","0","1"]]);
      el("exampleNote").textContent="Minkowski metric with signature (−,+,+,+).";
    }else if(v==="finsler2"){
      el("dimension").value="2"; setInputMode("lagrangian"); el("lagrangian").value="(sqrt((1+x1^2)*y1^2 + y2^2) + 0.15*y2)^2";
      el("exampleNote").textContent="Simple two-dimensional Randers-type Lagrangian entered directly.";
    }
    el("results").innerHTML=""; setStatus("Example loaded.","");
  }

  function init(){
    resizeMatrix(); resizeOneForm(); updateSelectionCount(); updateMode(); updateFormulaPreview();
    qa('input[name="inputMode"]').forEach(function(n){n.addEventListener("change",updateMode);});
    qa('input[name="geometryMode"]').forEach(function(n){n.addEventListener("change",updateAlphaBetaVisibility);});
    el("dimension").addEventListener("change",function(){ var m=snapshotMatrix(), b=snapshotOneForm(); resizeMatrix(m); resizeOneForm(b); });
    el("alphaBetaType").addEventListener("change",function(){updateMVisibility();updateFormulaPreview();});
    qa("[data-output]").forEach(function(n){n.addEventListener("change",updateSelectionCount);});
    el("selectAllOutputs").addEventListener("click",function(){setAllOutputs(true);});
    el("selectEssentials").addEventListener("click",selectEssentials);
    el("clearAllOutputs").addEventListener("click",function(){setAllOutputs(false);});
    el("calculateSelected").addEventListener("click",run);
    el("clearResults").addEventListener("click",clearResults);
    el("loadExample").addEventListener("click",loadExample);
    loadExample();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
