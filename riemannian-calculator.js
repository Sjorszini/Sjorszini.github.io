(function(){
  "use strict";

  var worker=null, runToken=0, coordinateNames=["t","r","theta","phi"], activeContext=null;
  var KNOWN_FUNCTIONS={sqrt:1,exp:1,sin:1,cos:1,tan:1,sinh:1,cosh:1,tanh:1,log:1,ln:1,abs:1,asin:1,acos:1,atan:1,atan2:1,min:1,max:1,sign:1};
  var BUILTIN_CONSTANTS={pi:1,e:1,i:1,Infinity:1};
  var PRESETS=[
    {id:"schwarzschild",name:"Schwarzschild spacetime",n:4,coords:["t","r","theta","phi"],constants:"r_s",functions:"",note:"Vacuum Schwarzschild metric in (-+++) with Schwarzschild radius r_s.",matrix:[["-(1-r_s/r)","0","0","0"],["0","1/(1-r_s/r)","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]},
    {id:"minkowski",name:"Minkowski spacetime",n:4,coords:["t","x","y","z"],constants:"",functions:"",note:"Flat Lorentzian metric in Cartesian coordinates.",matrix:[["-1","0","0","0"],["0","1","0","0"],["0","0","1","0"],["0","0","0","1"]]},
    {id:"flrw-flat",name:"FLRW spacetime (k = 0)",n:4,coords:["t","r","theta","phi"],constants:"",functions:"a(t)",note:"Spatially flat FLRW metric. The worker keeps derivatives of a(t) symbolic.",matrix:[["-1","0","0","0"],["0","a(t)^2","0","0"],["0","0","a(t)^2*r^2","0"],["0","0","0","a(t)^2*r^2*sin(theta)^2"]]},
    {id:"flrw-curved",name:"FLRW spacetime (general k)",n:4,coords:["t","r","theta","phi"],constants:"k",functions:"a(t)",note:"FLRW metric with spatial-curvature constant k.",matrix:[["-1","0","0","0"],["0","a(t)^2/(1-k*r^2)","0","0"],["0","0","a(t)^2*r^2","0"],["0","0","0","a(t)^2*r^2*sin(theta)^2"]]},
    {id:"ppwave",name:"Brinkmann pp-wave",n:4,coords:["u","v","x","y"],constants:"",functions:"H(u,x,y)",note:"Brinkmann form ds² = H du² - 2 du dv + dx² + dy².",matrix:[["H(u,x,y)","-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]]},
    {id:"sphere2",name:"Round 2-sphere",n:2,coords:["theta","phi"],constants:"R",functions:"",note:"Round 2-sphere of radius R.",matrix:[["R^2","0"],["0","R^2*sin(theta)^2"]]},
    {id:"polar2",name:"Euclidean plane (polar coordinates)",n:2,coords:["r","phi"],constants:"",functions:"",note:"Flat 2D Euclidean metric in polar coordinates.",matrix:[["1","0"],["0","r^2"]]}
  ];

  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function dimension(){return Number(el("dimension").value);}
  function currentCoords(){return qa(".coordinate-input",el("coordinateFields")).map(function(n){return n.value.trim();});}
  function setStatus(text,type){var node=el("status");node.textContent=text;node.className="calc-status"+(type?" is-"+type:"");}
  function typeset(node){if(window.MathJax&&window.MathJax.typesetPromise){if(window.MathJax.typesetClear)window.MathJax.typesetClear([node]);return window.MathJax.typesetPromise([node]).catch(function(){});}return Promise.resolve();}
  function validSymbol(name){try{var n=math.parse(name);return !!(n&&n.isSymbolNode&&n.name===name);}catch(e){return false;}}

  function renderCoordinates(names){
    var n=dimension(), old=names||coordinateNames||[], host=el("coordinateFields");
    host.innerHTML=""; coordinateNames=[]; host.style.setProperty("--coordinate-n",String(n));
    for(var i=0;i<n;i++){
      var name=old[i]||("x"+(i+1)); coordinateNames.push(name);
      var label=document.createElement("label"); label.className="coordinate-item";
      label.innerHTML='<span>x<sup>'+(i+1)+'</sup></span><input class="coordinate-input" data-index="'+i+'" value="'+esc(name)+'" aria-label="Coordinate '+(i+1)+'">';
      host.appendChild(label);
      label.querySelector("input").addEventListener("change",function(){
        try{validateCoords(currentCoords()); coordinateNames=currentCoords(); refreshAxes();}
        catch(err){setStatus(err.message,"error");}
      });
    }
    refreshAxes();
  }

  function validateCoords(names){
    var seen=Object.create(null);
    names.forEach(function(name,i){
      if(!name)throw new Error("Coordinate "+(i+1)+" is empty.");
      if(!validSymbol(name))throw new Error("‘"+name+"’ is not a valid coordinate symbol.");
      if(seen[name])throw new Error("Coordinate names must be unique.");
      seen[name]=1;
    });
    return names;
  }

  function snapshotMatrix(){
    var out=[];
    qa(".metric-entry",el("metricGrid")).forEach(function(c){var i=+c.dataset.i,j=+c.dataset.j;if(!out[i])out[i]=[];out[i][j]=c.value;});
    return out;
  }

  function resizeMatrix(values){
    var n=dimension(),host=el("metricGrid"),old=values||[],coords=currentCoords();
    host.innerHTML="";host.style.setProperty("--matrix-n",String(n));
    var blank=document.createElement("div");blank.className="matrix-corner";host.appendChild(blank);
    for(var c=0;c<n;c++){var h=document.createElement("div");h.className="matrix-axis";h.textContent=coords[c]||("x"+(c+1));host.appendChild(h);}
    for(var i=0;i<n;i++){
      var rh=document.createElement("div");rh.className="matrix-axis";rh.textContent=coords[i]||("x"+(i+1));host.appendChild(rh);
      for(var j=0;j<n;j++){
        var wrap=document.createElement("label");wrap.className="matrix-cell";
        var input=document.createElement("input");input.type="text";input.className="metric-entry";input.dataset.i=i;input.dataset.j=j;input.autocomplete="off";input.spellcheck=false;
        input.value=(old[i]&&old[i][j]!==undefined)?old[i][j]:(i===j?"1":"0");
        var sub=document.createElement("span");sub.textContent="g"+(i+1)+(j+1);wrap.appendChild(input);wrap.appendChild(sub);host.appendChild(wrap);
      }
    }
    qa(".metric-entry",host).forEach(function(input){
      input.addEventListener("input",function(){var i=+input.dataset.i,j=+input.dataset.j;if(i===j)return;var mate=host.querySelector('.metric-entry[data-i="'+j+'"][data-j="'+i+'"]');if(mate&&mate.value!==input.value)mate.value=input.value;});
      input.addEventListener("focus",function(){input.select();});
    });
  }

  function refreshAxes(){
    var coords=currentCoords(),n=dimension(),axes=qa(".matrix-axis",el("metricGrid"));
    if(axes.length>=2*n){for(var i=0;i<n;i++){axes[i].textContent=coords[i]||("x"+(i+1));axes[n+i].textContent=coords[i]||("x"+(i+1));}}
  }

  function collectGridValues(){
    var n=dimension(),out=[];
    for(var i=0;i<n;i++){out[i]=[];for(var j=0;j<n;j++){var c=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');out[i][j]=c?c.value.trim():"0";}}
    return out;
  }

  function splitTopLevel(text){
    var out=[],buf="",depth=0;
    String(text||"").split("").forEach(function(ch){if(ch==="(")depth++;else if(ch===")")depth=Math.max(0,depth-1);if((ch===","||ch==="\n"||ch===";")&&depth===0){if(buf.trim())out.push(buf.trim());buf="";}else buf+=ch;});
    if(buf.trim())out.push(buf.trim());return out;
  }

  function parseConstants(){var out=Object.create(null);splitTopLevel(el("constantsInput").value).forEach(function(x){var n=x.trim();if(n&&validSymbol(n))out[n]=1;});return out;}
  function parseFunctionDeclarations(){
    var out=Object.create(null);
    splitTopLevel(el("functionsInput").value).forEach(function(part){var m=/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(part);if(m)out[m[1]]={name:m[1],args:splitTopLevel(m[2])};});
    return out;
  }

  function inferNotation(){
    var coords=currentCoords(),coordSet=Object.create(null),fnSigs=Object.create(null),fnNames=Object.create(null),symbols=Object.create(null);
    coords.forEach(function(c){coordSet[c]=1;});
    collectGridValues().forEach(function(row){row.forEach(function(raw){
      var node;try{node=math.parse(raw);}catch(e){return;}
      node.traverse(function(child){if(child&&child.isFunctionNode&&child.fn&&child.fn.isSymbolNode&&!KNOWN_FUNCTIONS[child.fn.name]){var args=child.args.map(function(a){return a.toString({parenthesis:"auto"});});fnNames[child.fn.name]=1;fnSigs[child.fn.name+"("+args.join(",")+")"]=1;}});
      node.traverse(function(child){if(child&&child.isSymbolNode){var name=child.name;if(coordSet[name]||KNOWN_FUNCTIONS[name]||BUILTIN_CONSTANTS[name]||fnNames[name])return;symbols[name]=1;}});
    });});
    el("constantsInput").value=Object.keys(symbols).sort().join(", ");
    el("functionsInput").value=Object.keys(fnSigs).sort().join(", ");
    setStatus("Notation detected from the metric.","success");
  }

  function makeTranslationContext(){return {coords:validateCoords(currentCoords()),constants:parseConstants(),declaredFunctions:parseFunctionDeclarations(),functions:[],functionByKey:Object.create(null)};}
  function displayInternalArg(expr,coords){var s=String(expr);for(var i=coords.length;i>=1;i--)s=s.replace(new RegExp("\\bx"+i+"\\b","g"),coords[i-1]);return s;}
  function translateExpression(expr,ctx){
    var node=math.parse(String(expr)),symbolMap=Object.create(null);
    ctx.coords.forEach(function(name,i){symbolMap[name]="x"+(i+1);});
    node=node.transform(function(child){if(child&&child.isSymbolNode&&symbolMap[child.name])return math.parse(symbolMap[child.name]);return child;});
    node=node.transform(function(child){
      if(!child||!child.isFunctionNode||!child.fn||!child.fn.isSymbolNode)return child;
      var name=child.fn.name;if(KNOWN_FUNCTIONS[name])return child;
      if(ctx.constants[name])throw new Error(name+" is declared as a constant but is used as a function.");
      var args=child.args.map(function(a){return a.toString({parenthesis:"auto"});}),key=name+"\u0000"+args.join("\u0001"),found=ctx.functionByKey[key];
      if(!found){found={token:"__uf"+ctx.functions.length,name:name,args:args,argLabels:args.map(function(a){return displayInternalArg(a,ctx.coords);})};ctx.functionByKey[key]=found;ctx.functions.push(found);}
      return math.parse(found.token);
    });
    var functionTokens=Object.create(null);ctx.functions.forEach(function(f){functionTokens[f.token]=1;});
    node.traverse(function(child){
      if(!child||!child.isSymbolNode)return;
      var name=child.name;
      if(/^x\d+$/.test(name)||functionTokens[name]||BUILTIN_CONSTANTS[name]||ctx.constants[name]||KNOWN_FUNCTIONS[name])return;
      throw new Error("Undeclared symbol ‘"+name+"’. Add it under Constants, or write it as a function such as "+name+"("+ctx.coords[0]+").");
    });
    return node.toString({parenthesis:"auto"});
  }

  function functionDisplay(token,ctx){
    var m=/^__uf(\d+)(?:_d([0-9_]+))?$/.exec(token);if(!m)return token;
    var f=ctx.functions[+m[1]];if(!f)return token;
    if(!m[2])return f.name+"("+f.argLabels.join(",")+")";
    var inds=m[2].split("_").map(Number),suffix=inds.map(function(idx){var a=f.argLabels[idx-1]||("x"+idx);return String(a).replace(/[^A-Za-z0-9]/g,"");}).join("");
    return f.name+"_"+(suffix||inds.join(""));
  }

  function displayExpression(expr,ctx){
    var s=String(expr);
    s=s.replace(/__uf\d+(?:_d[0-9_]+)?/g,function(t){return functionDisplay(t,ctx);});
    for(var i=ctx.coords.length;i>=1;i--)s=s.replace(new RegExp("\\bx"+i+"\\b","g"),ctx.coords[i-1]);
    return s;
  }

  function expressionTex(expr,ctx){
    var display=displayExpression(expr,ctx);
    try{return math.parse(display).toTex({parenthesis:"keep"});}catch(e){return esc(display);}
  }
  function geodesicExpressionTex(expr,ctx){
    var marked=String(expr).replace(/\bv(\d+)\b/g,function(_,index){return "velocity"+String.fromCharCode(64+Number(index));});
    var tex=expressionTex(marked,ctx);
    ctx.coords.forEach(function(name,i){tex=tex.replace(new RegExp("velocity"+String.fromCharCode(65+i),"g"),"\\dot{"+coordTex(name)+"}");});
    return tex;
  }
  function coordTex(name){var greek={theta:"\\theta",phi:"\\phi",psi:"\\psi",eta:"\\eta",rho:"\\rho",tau:"\\tau",sigma:"\\sigma",lambda:"\\lambda"};if(greek[name])return greek[name];if(/^[A-Za-z]$/.test(name))return name;return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9_]/g,"")+"}";}
  function matrixTex(matrix,ctx){return "\\begin{pmatrix}"+matrix.map(function(row){return row.map(function(x){return expressionTex(x,ctx);}).join(" & ");}).join(" \\\\ ")+"\\end{pmatrix}";}

  function collectOutputs(){var out={};qa("[data-output]").forEach(function(n){out[n.dataset.output]=n.checked;});return out;}
  function updateSelectionCount(){el("selectionCount").textContent=qa("[data-output]:checked").length+" selected";}
  function setOutputs(keys){qa("[data-output]").forEach(function(n){n.checked=keys===true?true:!!keys[n.dataset.output];});updateSelectionCount();}

  function loadPresetById(id){
    var p=PRESETS.filter(function(x){return x.id===id;})[0]||PRESETS[0];
    el("dimension").value=String(p.n);coordinateNames=p.coords.slice();renderCoordinates(coordinateNames);resizeMatrix(p.matrix);el("constantsInput").value=p.constants;el("functionsInput").value=p.functions;el("presetSelect").value=p.id;el("presetNote").textContent=p.note;clearResults(false);setStatus("Loaded "+p.name+".","success");saveState();
  }

  function populatePresets(){
    var select=el("presetSelect");select.innerHTML="";
    PRESETS.forEach(function(p){var option=document.createElement("option");option.value=p.id;option.textContent=p.name;select.appendChild(option);});
  }

  function preparePayload(){
    var outputs=collectOutputs();if(!Object.keys(outputs).some(function(k){return outputs[k];}))throw new Error("Select at least one quantity to calculate.");
    var ctx=makeTranslationContext(),raw=collectGridValues();
    for(var i=0;i<raw.length;i++)for(var j=0;j<raw.length;j++){if(!raw[i][j])throw new Error("Metric entry g"+(i+1)+(j+1)+" is empty.");}
    var metric=raw.map(function(row){return row.map(function(v){return translateExpression(v,ctx);});});
    return {ctx:ctx,data:{type:"calculate",n:dimension(),metric:metric,outputs:outputs,symbolicFunctions:ctx.functions}};
  }

  function setBusy(on){
    qa("button,input,select",el("calculator-shell")).forEach(function(node){if(node.id==="cancelCalculation")return;node.disabled=on;});
    el("cancelCalculation").hidden=!on;el("progressLine").hidden=!on;
  }

  function calculate(){
    var payload;try{payload=preparePayload();}catch(err){setStatus(err.message||String(err),"error");return;}
    cancelCalculation(false);activeContext=payload.ctx;runToken++;var token=runToken;
    el("results").innerHTML="";el("calculationTime").textContent="";el("progressText").textContent="Starting worker…";setBusy(true);setStatus("Starting symbolic calculation…","working");
    worker=new Worker("riemannian-worker.js?v=1");
    worker.onmessage=function(event){if(token!==runToken)return;handleWorkerMessage(event.data||{},payload.ctx);};
    worker.onerror=function(event){if(token!==runToken)return;setBusy(false);el("progressLine").hidden=true;setStatus("Worker error: "+(event.message||"unknown error"),"error");};
    worker.postMessage(payload.data);saveState();
  }

  function handleWorkerMessage(message,ctx){
    if(message.type==="progress"){el("progressText").textContent=message.label+(message.detail?" · "+message.detail:"");setStatus(message.label+"…","working");return;}
    if(message.type==="result"){renderResults(message.result,ctx);return;}
    if(message.type==="done"){setBusy(false);el("progressLine").hidden=true;el("calculationTime").textContent=formatMs(message.elapsedMs);setStatus("Calculation complete in "+formatMs(message.elapsedMs)+".","success");worker=null;return;}
    if(message.type==="error"){setBusy(false);el("progressLine").hidden=true;setStatus(message.message||"Calculation failed.","error");worker=null;}
  }

  function formatMs(ms){return ms<1000?ms.toFixed(0)+" ms":(ms/1000).toFixed(ms<10000?2:1)+" s";}
  function resultCard(title,meta,body,copyText,open){
    var html='<details class="result-card"'+(open?' open':'')+'><summary><strong>'+esc(title)+'</strong><span>'+esc(meta||"")+'</span></summary><div class="result-card-body">'+body;
    if(copyText)html+='<div class="result-actions"><button type="button" class="copy-button" data-copy="'+esc(copyText)+'">Copy TeX</button></div>';
    return html+'</div></details>';
  }
  function mathBlock(tex){return '<div class="math-block">\\['+tex+'\\]</div>';}
  function componentList(items){if(!items.length)return '<p class="empty-result">All components simplify to zero.</p>';return '<div class="component-list">'+items.map(function(x){return '<div class="component-row">\\['+x+'\\]</div>';}).join("")+'</div>';}

  function renderResults(result,ctx){
    var cards=[];
    if(result.metric){var mt='g_{ij}='+matrixTex(result.metric,ctx);cards.push(resultCard("Metric","gᵢⱼ",mathBlock(mt),mt,true));}
    if(result.inverse){var inv='g^{ij}='+matrixTex(result.inverse.matrix,ctx),det='\\det(g)='+expressionTex(result.inverse.det,ctx);cards.push(resultCard("Inverse metric and determinant","gⁱʲ, det(g)",mathBlock(inv)+mathBlock(det),inv+"\n"+det,true));}
    if(result.christoffel){
      var gamma=result.christoffel.map(function(c){return '\\Gamma^{'+coordTex(ctx.coords[c.i])+'}{}_{'+coordTex(ctx.coords[c.j])+coordTex(ctx.coords[c.k])+'}='+expressionTex(c.value,ctx);});
      cards.push(resultCard("Levi-Civita connection",result.christoffel.length+" nonzero independent components",componentList(gamma),gamma.join("\n"),true));
    }
    if(result.geodesic){
      var geo=result.geodesic.map(function(c){var q=coordTex(ctx.coords[c.i]);return '\\ddot{'+q+'}+'+geodesicExpressionTex(c.value,ctx)+'=0';});
      cards.push(resultCard("Geodesic equations",result.geodesic.length+" equations",componentList(geo),geo.join("\n"),false));
    }
    if(result.riemann){
      var riem=result.riemann.map(function(c){return 'R^{'+coordTex(ctx.coords[c.i])+'}{}_{'+coordTex(ctx.coords[c.j])+coordTex(ctx.coords[c.k])+coordTex(ctx.coords[c.l])+'}='+expressionTex(c.value,ctx);});
      cards.push(resultCard("Riemann tensor",result.riemann.length+" nonzero components with k < l",componentList(riem),riem.join("\n"),false));
    }
    if(result.ricci){var rt='R_{ij}='+matrixTex(result.ricci,ctx);cards.push(resultCard("Ricci tensor","Rᵢⱼ",mathBlock(rt),rt,true));}
    if(result.scalar!==undefined){var st='R='+expressionTex(result.scalar,ctx);cards.push(resultCard("Ricci scalar","R",mathBlock(st),st,true));}
    if(result.einstein){var et='G_{ij}='+matrixTex(result.einstein,ctx);cards.push(resultCard("Einstein tensor","Gᵢⱼ",mathBlock(et),et,false));}
    el("results").innerHTML=cards.length?cards.join(""):'<div class="results-empty">No output was produced.</div>';
    qa(".copy-button",el("results")).forEach(function(button){button.addEventListener("click",function(){copyText(button.dataset.copy||"").then(function(){var old=button.textContent;button.textContent="Copied";setTimeout(function(){button.textContent=old;},1000);});});});
    typeset(el("results"));
  }

  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);return new Promise(function(resolve){var ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();resolve();});}
  function cancelCalculation(showStatus){if(worker){worker.terminate();worker=null;}runToken++;setBusy(false);el("progressLine").hidden=true;if(showStatus!==false)setStatus("Calculation cancelled.","");}
  function clearResults(setReady){cancelCalculation(false);el("results").innerHTML='<div class="results-empty">Choose quantities and calculate. Results will appear here.</div>';el("calculationTime").textContent="";if(setReady!==false)setStatus("Ready.","");}

  function saveState(){
    try{localStorage.setItem("riemannianCalculatorState",JSON.stringify({n:dimension(),coords:currentCoords(),constants:el("constantsInput").value,functions:el("functionsInput").value,matrix:collectGridValues(),outputs:collectOutputs(),preset:el("presetSelect").value}));}catch(e){}
  }
  function restoreState(){
    try{
      var raw=localStorage.getItem("riemannianCalculatorState");if(!raw)return false;var s=JSON.parse(raw);if(!s||![2,3,4].includes(Number(s.n)))return false;
      el("dimension").value=String(s.n);coordinateNames=(s.coords||[]).slice();renderCoordinates(coordinateNames);resizeMatrix(s.matrix||[]);el("constantsInput").value=s.constants||"";el("functionsInput").value=s.functions||"";
      if(s.outputs)qa("[data-output]").forEach(function(n){if(Object.prototype.hasOwnProperty.call(s.outputs,n.dataset.output))n.checked=!!s.outputs[n.dataset.output];});
      if(s.preset&&PRESETS.some(function(p){return p.id===s.preset;}))el("presetSelect").value=s.preset;updateSelectionCount();return true;
    }catch(e){return false;}
  }

  function init(){
    if(!window.math){setStatus("math.js failed to load.","error");return;}
    populatePresets();
    if(!restoreState())loadPresetById("schwarzschild");else{var p=PRESETS.filter(function(x){return x.id===el("presetSelect").value;})[0];el("presetNote").textContent=p?p.note:"Custom metric restored from this browser.";}
    el("dimension").addEventListener("change",function(){var old=snapshotMatrix(),coords=currentCoords();renderCoordinates(coords);resizeMatrix(old);saveState();});
    el("loadPreset").addEventListener("click",function(){loadPresetById(el("presetSelect").value);});
    el("presetSelect").addEventListener("change",function(){var p=PRESETS.filter(function(x){return x.id===el("presetSelect").value;})[0];el("presetNote").textContent=p?p.note:"";});
    el("detectNotation").addEventListener("click",inferNotation);
    el("calculateSelected").addEventListener("click",calculate);
    el("cancelCalculation").addEventListener("click",function(){cancelCalculation(true);});
    el("clearResults").addEventListener("click",function(){clearResults(true);});
    el("selectAllOutputs").addEventListener("click",function(){setOutputs(true);});
    el("clearAllOutputs").addEventListener("click",function(){setOutputs({});});
    el("selectEssentials").addEventListener("click",function(){setOutputs({metric:1,inverse:1,christoffel:1,ricci:1,scalar:1});});
    qa("[data-output]").forEach(function(n){n.addEventListener("change",function(){updateSelectionCount();saveState();});});
    ["constantsInput","functionsInput"].forEach(function(id){el(id).addEventListener("change",saveState);});
    el("metricGrid").addEventListener("change",saveState);el("coordinateFields").addEventListener("change",saveState);
    updateSelectionCount();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
