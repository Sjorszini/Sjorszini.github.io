(function(){
  "use strict";

  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function currentCoords(){return qa(".coordinate-input").map(function(n){return n.value.trim();});}
  function payloadFunctions(){var p=window.__riemannianLastPayload||{};return p.symbolicFunctions||[];}

  function functionDisplay(token){
    var m=/^__uf(\d+)(?:_d([0-9_]+))?$/.exec(token);if(!m)return token;
    var f=payloadFunctions()[+m[1]];if(!f)return token;
    var labels=(f.argLabels||f.args||[]).slice();
    if(!m[2])return f.name+"("+labels.join(",")+")";
    var inds=m[2].split("_").map(Number),suffix=inds.map(function(idx){var a=labels[idx-1]||("x"+idx);return String(a).replace(/[^A-Za-z0-9]/g,"");}).join("");
    return f.name+"_"+(suffix||inds.join(""));
  }

  function displayExpression(expr){
    var s=String(expr),coords=currentCoords();
    s=s.replace(/__uf\d+(?:_d[0-9_]+)?/g,function(t){return functionDisplay(t);});
    for(var i=coords.length;i>=1;i--)s=s.replace(new RegExp("\\bx"+i+"\\b","g"),coords[i-1]);
    return s;
  }

  function expressionTex(expr){
    var display=displayExpression(expr);
    try{return math.parse(display).toTex({parenthesis:"keep"});}catch(e){return display;}
  }

  function coordTex(name){
    var greek={alpha:"\\alpha",beta:"\\beta",gamma:"\\gamma",delta:"\\delta",epsilon:"\\epsilon",eta:"\\eta",theta:"\\theta",lambda:"\\lambda",mu:"\\mu",nu:"\\nu",xi:"\\xi",rho:"\\rho",sigma:"\\sigma",tau:"\\tau",phi:"\\phi",psi:"\\psi",omega:"\\omega"};
    if(greek[name])return greek[name];
    var sub=/^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(name);if(sub)return sub[1]+"_{"+sub[2]+"}";
    return /^[A-Za-z]$/.test(name)?name:"\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";
  }

  function isZero(value){var s=String(value).replace(/\s+/g,"");return s==="0"||s==="0.0"||s==="-0";}

  function components(matrix,prefix){
    var coords=currentCoords(),out=[];
    if(!Array.isArray(matrix))return out;
    for(var i=0;i<matrix.length;i++)for(var j=i;j<matrix.length;j++){
      var value=matrix[i]&&matrix[i][j]!==undefined?matrix[i][j]:"0";
      if(isZero(value))continue;
      var lhs=prefix+"_{"+coordTex(coords[i]||("x"+(i+1)))+coordTex(coords[j]||("x"+(j+1)))+"}";
      out.push(lhs+"="+expressionTex(value));
    }
    return out;
  }

  function findCard(title){
    return qa("#results .result-card").find(function(card){var s=card.querySelector("summary strong");return s&&s.textContent.trim()===title;})||null;
  }

  function replaceCard(title,matrix,prefix){
    var card=findCard(title);if(!card)return;
    var body=card.querySelector(".result-card-body");if(!body||body.dataset.componentized==="1")return;
    var items=components(matrix,prefix),meta=card.querySelector("summary span");
    if(meta)meta.textContent=items.length+" nonzero component"+(items.length===1?"":"s");
    body.innerHTML="";body.dataset.componentized="1";
    if(!items.length){
      var empty=document.createElement("p");empty.className="empty-result";empty.textContent="All components simplify to zero.";body.appendChild(empty);
    }else{
      var list=document.createElement("div");list.className="component-list";
      items.forEach(function(tex){var row=document.createElement("div");row.className="component-row";row.textContent="\\["+tex+"\\]";list.appendChild(row);});
      body.appendChild(list);
    }
    var actions=document.createElement("div");actions.className="result-actions";
    var button=document.createElement("button");button.type="button";button.className="copy-button";button.textContent="Copy TeX";button.dataset.copy=items.join("\n");
    button.addEventListener("click",function(){var text=button.dataset.copy||"";var done=function(){var old=button.textContent;button.textContent="Copied";setTimeout(function(){button.textContent=old;},1000);};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done);else done();});
    actions.appendChild(button);body.appendChild(actions);
    if(window.MathJax&&MathJax.typesetPromise){if(MathJax.typesetClear)MathJax.typesetClear([body]);MathJax.typesetPromise([body]).catch(function(){});}
  }

  var rewriting=false,scheduled=false;
  function rewrite(){
    scheduled=false;if(rewriting)return;var result=window.__riemannianLastResult;if(!result)return;
    rewriting=true;try{
      if(result.ricci)replaceCard("Ricci tensor",result.ricci,"R");
      if(result.einstein)replaceCard("Einstein tensor",result.einstein,"G");
    }finally{rewriting=false;}
  }
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(rewrite,0);}

  function install(){
    var host=document.getElementById("results");if(!host)return;
    new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
    schedule();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
})();
