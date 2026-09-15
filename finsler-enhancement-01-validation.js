(function(){
  "use strict";

  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function coords(){return qa(".coordinate-input").map(function(n){return n.value.trim();});}
  function splitTopLevel(text){
    var out=[],buf="",depth=0;
    String(text||"").split("").forEach(function(ch){
      if(ch==="(")depth++; else if(ch===")")depth--;
      if((ch===","||ch===";"||ch==="\n")&&depth===0){if(buf.trim())out.push(buf.trim());buf="";}else buf+=ch;
    });
    if(buf.trim())out.push(buf.trim());
    return out;
  }
  function compactError(err){
    var s=String(err&&err.message?err.message:err||"Invalid expression");
    return s.replace(/^Error:\s*/,"").replace(/\s+/g," ").trim();
  }
  function expressionError(value){
    var s=String(value==null?"":value).trim();
    if(!s)return "Expression is empty.";
    if(!window.math||!math.parse)return null;
    try{
      var node=math.parse(s);
      if(node&&(node.isAssignmentNode||node.isFunctionAssignmentNode||node.isBlockNode))return "Assignments are not allowed here.";
      return null;
    }catch(err){return compactError(err);}
  }
  function declarationError(value,kind){
    var parts=splitTopLevel(value);
    if(!String(value||"").trim())return null;
    if(kind==="constant"){
      for(var i=0;i<parts.length;i++)if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[i]))return "Invalid constant declaration: "+parts[i];
      return null;
    }
    for(var j=0;j<parts.length;j++){
      var m=/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(parts[j]);
      if(!m)return "Use function notation such as A(t,r): "+parts[j];
      var args=splitTopLevel(m[2]);
      if(!args.length)return "Function arguments are required: "+parts[j];
      for(var k=0;k<args.length;k++){
        var problem=expressionError(args[k]);
        if(problem)return "Invalid argument in "+parts[j]+": "+problem;
      }
    }
    return null;
  }
  function coordinateError(){
    var names=coords(),seen=Object.create(null);
    for(var i=0;i<names.length;i++){
      if(!names[i])return {input:qa(".coordinate-input")[i],message:"Coordinate "+(i+1)+" is empty."};
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(names[i]))return {input:qa(".coordinate-input")[i],message:"Invalid coordinate symbol: "+names[i]};
      if(seen[names[i]])return {input:qa(".coordinate-input")[i],message:"Coordinate names must be unique."};
      seen[names[i]]=1;
    }
    return null;
  }
  function fieldLabel(input){
    if(input.classList.contains("metric-entry")){
      var c=coords(),i=Number(input.dataset.i),j=Number(input.dataset.j);
      return "g_"+(c[i]||String(i+1))+(c[j]||String(j+1));
    }
    if(input.classList.contains("oneform-entry")){
      var names=coords(),n=Number(input.dataset.i);return "b_"+(names[n]||String(n+1));
    }
    if(input.id==="lagrangian")return "L(x,y)";
    if(input.id==="mParameter")return "m";
    if(input.id==="constantsInput")return "Constants";
    if(input.id==="functionsInput")return "Functions";
    if(input.classList.contains("coordinate-input"))return "Coordinate "+(Number(input.dataset.index)+1);
    return input.id||"Input";
  }
  function inlineHost(input){
    if(input.classList.contains("metric-entry")||input.classList.contains("oneform-entry")||input.classList.contains("coordinate-input"))return null;
    var parent=input.parentElement;if(!parent)return null;
    var msg=parent.querySelector(":scope > .finsler-validation-message");
    if(!msg){msg=document.createElement("small");msg.className="finsler-validation-message";msg.hidden=true;parent.appendChild(msg);}
    return msg;
  }
  function mark(input,message){
    if(!input)return;
    var bad=!!message;
    input.classList.toggle("finsler-invalid",bad);
    input.setAttribute("aria-invalid",bad?"true":"false");
    if(input.setCustomValidity)input.setCustomValidity(message||"");
    if(bad){input.dataset.validationError=message;input.title=fieldLabel(input)+": "+message;}else{delete input.dataset.validationError;if(input.title&&input.title.indexOf(fieldLabel(input)+": ")===0)input.removeAttribute("title");}
    var host=inlineHost(input);if(host){host.hidden=!bad;host.textContent=bad?message:"";}
  }
  function validateField(input){
    var message=null;
    if(input.id==="constantsInput")message=declarationError(input.value,"constant");
    else if(input.id==="functionsInput")message=declarationError(input.value,"function");
    else message=expressionError(input.value);
    mark(input,message);
    return message;
  }
  function relevantFields(){
    var fields=[];
    if(document.querySelector('input[name="inputMode"]:checked')&&document.querySelector('input[name="inputMode"]:checked').value==="lagrangian"){
      var L=el("lagrangian");if(L)fields.push(L);
    }else{
      fields=fields.concat(qa(".metric-entry"));
      var ab=document.querySelector('input[name="geometryMode"]:checked');
      if(ab&&ab.value==="alphabeta"){
        fields=fields.concat(qa(".oneform-entry"));
        if(el("alphaBetaType")&&el("alphaBetaType").value==="mkropina"&&el("mParameter"))fields.push(el("mParameter"));
      }
    }
    if(el("constantsInput"))fields.push(el("constantsInput"));
    if(el("functionsInput"))fields.push(el("functionsInput"));
    return fields;
  }
  function validateAll(showStatus){
    var first=coordinateError();
    qa(".coordinate-input").forEach(function(input){if(!first||first.input!==input)mark(input,null);});
    var fields=relevantFields();
    for(var i=0;i<fields.length;i++){
      var msg=validateField(fields[i]);
      if(msg&&!first)first={input:fields[i],message:fieldLabel(fields[i])+": "+msg};
    }
    var result={ok:!first,first:first};
    window.FINSLER_INPUT_VALIDATION=result;
    if(first&&showStatus){
      var status=el("status");if(status){status.textContent=first.message;status.className="calc-status is-error";}
      if(first.input){first.input.focus();if(first.input.select)first.input.select();}
    }
    return result;
  }
  var timer=null;
  function schedule(){clearTimeout(timer);timer=setTimeout(function(){validateAll(false);},90);}
  function addStyles(){
    if(el("finsler-validation-styles"))return;
    var style=document.createElement("style");style.id="finsler-validation-styles";
    style.textContent='.finsler-invalid{border-color:#b42318!important;box-shadow:0 0 0 2px rgba(180,35,24,.12)!important;background:#fff8f7!important}.finsler-validation-message{display:block;color:#b42318;font-size:.78rem;line-height:1.35;margin-top:.35rem}.finsler-validation-message[hidden]{display:none!important}';
    document.head.appendChild(style);
  }
  function init(){
    addStyles();
    document.addEventListener("input",function(e){if(e.target&&e.target.matches&&e.target.matches(".metric-entry,.oneform-entry,.coordinate-input,#lagrangian,#constantsInput,#functionsInput,#mParameter"))schedule();});
    document.addEventListener("change",function(e){if(e.target&&e.target.matches&&e.target.matches('input[name="inputMode"],input[name="geometryMode"],#alphaBetaType,#dimension,.coordinate-input'))schedule();});
    var calc=el("calculateSelected");
    if(calc)calc.addEventListener("click",function(event){var result=validateAll(true);if(!result.ok){event.preventDefault();event.stopImmediatePropagation();}},true);
    var shell=el("calculator-shell");if(shell)new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});
    setTimeout(function(){validateAll(false);},80);
    window.FINSLER_VALIDATION_API={expressionError:expressionError,declarationError:declarationError,validateAll:validateAll};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();