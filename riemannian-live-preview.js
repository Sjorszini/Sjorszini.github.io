(function(){
  "use strict";

  var timer=null, renderSerial=0, typesetChain=Promise.resolve();

  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}

  function coordinates(){
    return qa(".coordinate-input",el("coordinateFields")).map(function(input){return input.value.trim()||("x"+(Number(input.dataset.index)+1));});
  }

  function matrixValues(){
    var n=Number(el("dimension").value),out=[];
    for(var i=0;i<n;i++){
      out[i]=[];
      for(var j=0;j<n;j++){
        var input=el("metricGrid").querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');
        out[i][j]=input?input.value.trim():"0";
      }
    }
    return out;
  }

  function expressionTex(value){
    var text=String(value||"").trim();
    if(!text)throw new Error("one or more metric entries are empty");
    return math.parse(text).toTex({parenthesis:"auto",implicit:"hide"});
  }

  function coordinateTex(name){
    try{return math.parse(name).toTex({parenthesis:"auto",implicit:"hide"});}
    catch(e){return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";}
  }

  function matrixTex(matrix){
    return "\\begin{pmatrix}"+matrix.map(function(row){return row.map(expressionTex).join(" & ");}).join(" \\\\ ")+"\\end{pmatrix}";
  }

  function queueTypeset(host,serial){
    if(!window.MathJax||!window.MathJax.typesetPromise)return;
    typesetChain=typesetChain.then(function(){
      if(serial!==renderSerial||!host.isConnected)return;
      if(window.MathJax.typesetClear)window.MathJax.typesetClear([host]);
      return window.MathJax.typesetPromise([host]);
    }).catch(function(){});
  }

  function render(){
    timer=null;
    var host=el("metricPreview");if(!host||!window.math)return;
    var serial=++renderSerial,coords=coordinates(),values=matrixValues(),tex;
    try{
      tex="g_{ij}\!\left("+coords.map(coordinateTex).join(",")+"\right)="+matrixTex(values);
      host.classList.remove("has-preview-error");
      host.dataset.tex=tex;
      host.innerHTML='<div class="metric-preview-formula">\\['+tex+'\\]</div><div class="metric-preview-order"><span>Coordinate order</span><strong>\\(('+coords.map(coordinateTex).join(", ")+')\\)</strong></div>';
      queueTypeset(host,serial);
    }catch(err){
      delete host.dataset.tex;
      host.classList.add("has-preview-error");
      host.innerHTML='<div class="metric-preview-error"><strong>Preview paused</strong><span>Finish the current expression to render the metric.</span></div>';
    }
  }

  function schedule(delay){
    if(timer!==null)clearTimeout(timer);
    timer=setTimeout(render,delay===undefined?90:delay);
  }

  function relevant(target){
    return target&&(
      target.matches&&target.matches(".metric-entry, .coordinate-input, #dimension, #constantsInput, #functionsInput")
    );
  }

  function init(){
    if(!el("metricPreview"))return;
    document.addEventListener("input",function(event){if(relevant(event.target))schedule();});
    document.addEventListener("change",function(event){if(relevant(event.target))schedule(20);});
    document.addEventListener("click",function(event){
      var target=event.target&&event.target.closest?event.target.closest("#loadPreset, #detectNotation"):null;
      if(target)schedule(20);
    });
    schedule(20);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
