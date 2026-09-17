(function(){
  "use strict";

  var BUILTIN_FUNCTIONS={sqrt:1,exp:1,sin:1,cos:1,tan:1,sinh:1,cosh:1,tanh:1,log:1,ln:1,abs:1,asin:1,acos:1,atan:1,atan2:1,min:1,max:1,sign:1};
  var COMPACT_FUNCTIONS={sin:"\\sin",cos:"\\cos",tan:"\\tan",sinh:"\\sinh",cosh:"\\cosh",tanh:"\\tanh",log:"\\log",ln:"\\ln",exp:"\\exp",asin:"\\arcsin",acos:"\\arccos",atan:"\\arctan"};

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

  function atomicTex(name){
    var greek={
      alpha:"\\alpha",beta:"\\beta",gamma:"\\gamma",delta:"\\delta",epsilon:"\\epsilon",zeta:"\\zeta",eta:"\\eta",theta:"\\theta",iota:"\\iota",kappa:"\\kappa",lambda:"\\lambda",mu:"\\mu",nu:"\\nu",xi:"\\xi",omicron:"o",pi:"\\pi",rho:"\\rho",sigma:"\\sigma",tau:"\\tau",upsilon:"\\upsilon",phi:"\\phi",chi:"\\chi",psi:"\\psi",omega:"\\omega",
      Gamma:"\\Gamma",Delta:"\\Delta",Theta:"\\Theta",Lambda:"\\Lambda",Xi:"\\Xi",Pi:"\\Pi",Sigma:"\\Sigma",Upsilon:"\\Upsilon",Phi:"\\Phi",Psi:"\\Psi",Omega:"\\Omega"
    };
    if(greek[name])return greek[name];
    if(name==="Infinity")return "\\infty";
    if(/^[A-Za-z]$/.test(name))return name;
    if(/^[0-9]+$/.test(name))return name;
    return "\\mathrm{"+String(name).replace(/[^A-Za-z0-9]/g,"")+"}";
  }

  function simpleTex(name){
    var text=String(name),parts=text.split("_");
    if(parts.length>1&&parts.every(function(p){return /^[A-Za-z0-9]+$/.test(p);})){var base=atomicTex(parts.shift()),sub=parts.map(atomicTex).join(",");return base+"_{"+sub+"}";}
    return atomicTex(text);
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
      return "{"+compactDerivativeTex(def,indices)+"}";
    }
    return null;
  }

  function symbolTex(name){
    if(BUILTIN_FUNCTIONS[name])return null;
    if(/^velocity[A-Z]$/.test(name))return null;
    return "{"+simpleTex(name)+"}";
  }

  function compactFunctionTex(node){
    if(!node||!node.isFunctionNode||!node.fn||!node.fn.isSymbolNode||node.args.length!==1)return null;
    var command=COMPACT_FUNCTIONS[node.fn.name];if(!command)return null;
    var arg=node.args[0];if(arg&&arg.isParenthesisNode)arg=arg.content;
    var argTex=null;
    if(arg&&arg.isSymbolNode)argTex=derivativeTex(arg.name)||symbolTex(arg.name)||simpleTex(arg.name);
    else if(arg&&arg.isConstantNode)argTex=String(arg.value);
    if(!argTex)return null;
    return command+" "+argTex;
  }

  function declaredFunctionTex(node){
    if(!node||!node.isFunctionNode||!node.fn||!node.fn.isSymbolNode)return null;
    var defs=declaredFunctions();
    for(var i=0;i<defs.length;i++){
      if(defs[i].name===node.fn.name&&defs[i].args.length===node.args.length)return "{"+simpleTex(defs[i].name)+"}";
    }
    return null;
  }

  function cleanMultiplicationTex(tex){
    /* In ordinary tensor formulas juxtaposition is clearer than explicit dots:
       r\\cdot t -> rt and 2\\cdot r -> 2r. Keep a TeX source-space so control
       sequences can never merge with the following symbol. */
    return String(tex).replace(/\\cdot\s*/g," ");
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
          if(child&&child.isFunctionNode){
            var fnPretty=compactFunctionTex(child);if(fnPretty)return fnPretty;
            if(!opts.preserveFunctionArguments){fnPretty=declaredFunctionTex(child);if(fnPretty)return fnPretty;}
          }
          if(child&&child.isSymbolNode){
            var pretty=derivativeTex(child.name);if(pretty)return pretty;
            pretty=symbolTex(child.name);if(pretty)return pretty;
          }
          if(typeof previous==="function")return previous(child,childOptions);
        };
        return cleanMultiplicationTex(originalToTex.call(this,opts));
      };
      return node;
    };
    math.__riemannianPrettyPatched=true;
  }

  installTexPatch();
})();
