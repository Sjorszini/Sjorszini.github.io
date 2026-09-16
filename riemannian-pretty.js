(function(){
  "use strict";

  function splitTopLevel(text){
    var out=[],buf="",depth=0;
    String(text||"").split("").forEach(function(ch){
      if(ch==="(")depth++;else if(ch===")")depth=Math.max(0,depth-1);
      if((ch===","||ch===";"||ch==="\n")&&depth===0){if(buf.trim())out.push(buf.trim());buf="";}else buf+=ch;
    });
    if(buf.trim())out.push(buf.trim());return out;
  }

  function declaredFunctions(){
    var input=document.getElementById("functionsInput"),out=[];
    if(!input)return out;
    splitTopLevel(input.value).forEach(function(part){
      var m=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/.exec(part);
      if(!m)return;
      var args=splitTopLevel(m[2]);
      out.push({name:m[1],args:args,safeArgs:args.map(function(x){return x.replace(/[^A-Za-z0-9]/g,"");})});
    });
    out.sort(function(a,b){return b.name.length-a.name.length;});
    return out;
  }

  function simpleTex(name){
    var greek={alpha:"\\alpha",beta:"\\beta",gamma:"\\gamma",delta:"\\delta",epsilon:"\\epsilon",eta:"\\eta",theta:"\\theta",lambda:"\\lambda",mu:"\\mu",nu:"\\nu",xi:"\\xi",rho:"\\rho",sigma:"\\sigma",tau:"\\tau",phi:"\\phi",psi:"\\psi",omega:"\\omega"};
    if(greek[name])return greek[name];
    if(/^[A-Za-z]$/.test(name))return name;
    var sub=/^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(name);
    if(sub)return (sub[1].length===1?sub[1]:"\\mathrm{"+sub[1]+"}")+"_{"+sub[2]+"}";
    return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";
  }

  function splitSuffix(suffix,args){
    var memo=Object.create(null);
    function walk(pos){
      if(pos===suffix.length)return [];
      if(Object.prototype.hasOwnProperty.call(memo,pos))return memo[pos];
      for(var i=0;i<args.length;i++){
        var token=args[i];if(!token)continue;
        if(suffix.slice(pos,pos+token.length)===token){
          var rest=walk(pos+token.length);
          if(rest){memo[pos]=[i].concat(rest);return memo[pos];}
        }
      }
      memo[pos]=null;return null;
    }
    return walk(0);
  }

  function compactDerivativeTex(def,indices){
    var nameTex=simpleTex(def.name),order=indices.length;
    if(def.args.length===1&&def.safeArgs[0]==="t"){
      if(order===1)return "\\dot{"+nameTex+"}";
      if(order===2)return "\\ddot{"+nameTex+"}";
      return "\\partial_{t}^{"+order+"}"+nameTex;
    }
    var counts=Object.create(null);
    indices.forEach(function(i){counts[i]=(counts[i]||0)+1;});
    var ops=[];
    Object.keys(counts).map(Number).sort(function(a,b){return a-b;}).forEach(function(i){
      var count=counts[i],arg=simpleTex(def.args[i]||("x"+(i+1)));
      ops.push("\\partial_{"+arg+"}"+(count>1?"^{"+count+"}":""));
    });
    return ops.join("")+nameTex;
  }

  function derivativeTex(symbol){
    var defs=declaredFunctions();
    for(var d=0;d<defs.length;d++){
      var def=defs[d],prefix=def.name+"_";
      if(symbol.indexOf(prefix)!==0)continue;
      var suffix=symbol.slice(prefix.length),indices=splitSuffix(suffix,def.safeArgs);
      if(!indices||!indices.length)continue;
      return compactDerivativeTex(def,indices);
    }
    return null;
  }

  function installTexPatch(){
    if(!window.math||!math.parse||math.__riemannianPrettyPatched)return;
    var originalParse=math.parse.bind(math);
    math.parse=function(){
      var node=originalParse.apply(null,arguments),originalToTex=node&&node.toTex;
      if(!node||typeof originalToTex!=="function")return node;
      node.toTex=function(options){
        var opts=Object.assign({},options||{}),previous=opts.handler;
        opts.parenthesis="auto";opts.implicit="hide";
        opts.handler=function(child,childOptions){
          if(child&&child.isSymbolNode){var pretty=derivativeTex(child.name);if(pretty)return pretty;}
          if(typeof previous==="function")return previous(child,childOptions);
        };
        return originalToTex.call(this,opts);
      };
      return node;
    };
    math.__riemannianPrettyPatched=true;
  }

  function installWorkerPatch(){
    if(!window.Worker||window.Worker.__riemannianPrettyPatched)return;
    var NativeWorker=window.Worker;
    function PatchedWorker(url,options){
      var target=String(url);
      if(/(?:^|\/)riemannian-worker\.js(?:\?v=1)?$/.test(target))target=target.replace(/\?v=1$/,"")+"?v=2";
      return new NativeWorker(target,options);
    }
    PatchedWorker.prototype=NativeWorker.prototype;
    Object.setPrototypeOf(PatchedWorker,NativeWorker);
    PatchedWorker.__riemannianPrettyPatched=true;
    window.Worker=PatchedWorker;
  }

  installTexPatch();
  installWorkerPatch();
})();