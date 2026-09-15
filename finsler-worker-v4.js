"use strict";

importScripts("finsler-worker-v3.js?v=1");

/* math.simplify is good at local algebra but it does not factor expanded
 * numerator/denominator polynomials before presentation. In tensor work that
 * can leave output such as
 *
 *   (r*rs-r^2)/(r^3*rs-r^4)
 *
 * even though the common factors cancel to 1/r^2. Keep the computational
 * expressions untouched and strengthen only PS(), the final presentation
 * simplifier used by emitted components and summaries. The factoring below is
 * structural and conservative: it extracts factors common to every term of an
 * additive factor, including additive factors nested inside products/powers,
 * and then cancels exact numerator/denominator factors.
 */
var finslerBasePS = PS;

function finslerCanonicalNodeText(node){
  try{return math.simplify(node).toString({parenthesis:"auto"});}
  catch(e){return node.toString({parenthesis:"auto"});}
}

function finslerAddFactor(store,node,power){
  if(power<=0)return;
  var text=finslerCanonicalNodeText(node);
  if(text==="1")return;
  if(!store.map[text]){
    store.map[text]={text:text,power:0};
    store.order.push(text);
  }
  store.map[text].power+=power;
}

function finslerMergeFactors(target,source,mult){
  mult=mult||1;
  if(source.sign<0&&mult%2===1)target.sign*=-1;
  source.order.forEach(function(key){
    var entry=source.map[key];
    if(!target.map[key]){
      target.map[key]={text:entry.text,power:0};
      target.order.push(key);
    }
    target.map[key].power+=entry.power*mult;
  });
}

function finslerTermFactors(node){
  var out={sign:1,map:Object.create(null),order:[]};
  function walk(n,mult){
    while(n&&n.isParenthesisNode)n=n.content;
    if(!n)return;
    if(n.isOperatorNode&&n.op==="-"&&n.args.length===1&&mult===1){
      out.sign*=-1;
      walk(n.args[0],1);
      return;
    }
    if(n.isOperatorNode&&n.op==="*"&&mult===1){
      n.args.forEach(function(arg){walk(arg,1);});
      return;
    }
    if(n.isOperatorNode&&n.op==="^"&&n.args.length===2){
      var exponent=n.args[1];
      if(exponent&&exponent.isConstantNode){
        var p=Number(exponent.value);
        if(Number.isInteger(p)&&p>0){walk(n.args[0],mult*p);return;}
      }
    }
    if(n.isOperatorNode&&(n.op==="+"||(n.op==="-"&&n.args.length===2))){
      finslerMergeFactors(out,finslerFactorExpression(n),mult);
      return;
    }
    finslerAddFactor(out,n,mult);
  }
  walk(node,1);
  return out;
}

function finslerCollectSumTerms(node,sign,out){
  while(node&&node.isParenthesisNode)node=node.content;
  if(node&&node.isOperatorNode){
    if(node.op==="+"&&node.args.length===2){
      finslerCollectSumTerms(node.args[0],sign,out);
      finslerCollectSumTerms(node.args[1],sign,out);
      return;
    }
    if(node.op==="-"&&node.args.length===2){
      finslerCollectSumTerms(node.args[0],sign,out);
      finslerCollectSumTerms(node.args[1],-sign,out);
      return;
    }
    if(node.op==="-"&&node.args.length===1){
      finslerCollectSumTerms(node.args[0],-sign,out);
      return;
    }
  }
  out.push({node:node,sign:sign});
}

function finslerProductText(factors,removed){
  var parts=[];
  factors.order.forEach(function(key){
    var have=factors.map[key]?factors.map[key].power:0;
    var take=removed&&removed[key]?removed[key]:0;
    var p=have-take;
    if(p<=0)return;
    var atom=factors.map[key].text;
    parts.push(p===1?"("+atom+")":"("+atom+")^"+p);
  });
  return parts.length?parts.join("*"):"1";
}

function finslerFactorExpression(node){
  var terms=[];
  finslerCollectSumTerms(node,1,terms);
  if(terms.length<=1)return finslerTermFactors(node);

  var factored=terms.map(function(term){
    var f=finslerTermFactors(term.node);
    f.sign*=term.sign;
    return f;
  });
  var common=Object.create(null),commonKeys=[];
  factored[0].order.forEach(function(key){
    var p=factored[0].map[key].power;
    for(var i=1;i<factored.length;i++){
      p=Math.min(p,factored[i].map[key]?factored[i].map[key].power:0);
    }
    if(p>0){common[key]=p;commonKeys.push(key);}
  });

  if(!commonKeys.length){
    var whole={sign:1,map:Object.create(null),order:[]};
    finslerAddFactor(whole,node,1);
    return whole;
  }

  var residualParts=factored.map(function(f){
    var body=finslerProductText(f,common);
    return f.sign<0?"-("+body+")":"("+body+")";
  });
  var residualText=residualParts.join("+");
  try{residualText=math.simplify(residualText).toString({parenthesis:"auto"});}catch(e){}

  var result={sign:1,map:Object.create(null),order:[]};
  commonKeys.forEach(function(key){
    result.map[key]={text:factored[0].map[key].text,power:common[key]};
    result.order.push(key);
  });
  if(residualText!=="1"){
    try{finslerAddFactor(result,math.parse(residualText),1);}catch(e2){}
  }
  return result;
}

function finslerCancelCommonRationalFactors(text){
  var node;
  try{node=math.parse(text);}catch(e){return null;}
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node||!node.isOperatorNode||node.op!=="/"||node.args.length!==2)return null;

  var numerator=finslerFactorExpression(node.args[0]);
  var denominator=finslerFactorExpression(node.args[1]);
  var cancel=Object.create(null),cancelled=false;
  numerator.order.forEach(function(key){
    if(!denominator.map[key])return;
    var p=Math.min(numerator.map[key].power,denominator.map[key].power);
    if(p>0){cancel[key]=p;cancelled=true;}
  });
  if(!cancelled)return null;

  var num=finslerProductText(numerator,cancel);
  var den=finslerProductText(denominator,cancel);
  if(numerator.sign*denominator.sign<0)num="-("+num+")";
  var candidate=den==="1"?num:"("+num+")/("+den+")";
  try{candidate=math.simplify(candidate).toString({parenthesis:"auto"});}catch(e3){}

  if(typeof math.symbolicEqual==="function"){
    try{if(!math.symbolicEqual(text,candidate))return null;}catch(e4){}
  }
  return candidate;
}

function finslerPresentationScore(text){return String(text).replace(/\s+/g,"").length;}
function finslerConsiderPresentation(best,candidate,original){
  if(!candidate)return best;
  try{candidate=math.simplify(candidate).toString({parenthesis:"auto"});}catch(e){}
  if(typeof math.symbolicEqual==="function"){
    try{if(!math.symbolicEqual(original,candidate))return best;}catch(e2){}
  }
  return finslerPresentationScore(candidate)<finslerPresentationScore(best)?candidate:best;
}

PS=function(expr){
  var base=finslerBasePS(expr),best=base;
  best=finslerConsiderPresentation(best,finslerCancelCommonRationalFactors(base),base);
  if(typeof math.rationalize==="function"){
    try{
      var rational=math.rationalize(base).toString({parenthesis:"auto"});
      best=finslerConsiderPresentation(best,rational,base);
      best=finslerConsiderPresentation(best,finslerCancelCommonRationalFactors(rational),base);
    }catch(e){}
  }
  return best;
};

var finslerBaseOnMessage = onmessage;
var finslerFunctionInfo = Object.create(null);
var finslerBaseByKey = Object.create(null);

function finslerSymbolNode(variable){
  var symbol = math.parse(String(variable));
  if(!symbol || !symbol.isSymbolNode) throw new Error("Invalid differentiation variable: "+variable);
  return symbol;
}

function finslerNativeD(expr,variable){
  var text=raw(expr);
  return S(math.derivative(math.parse(text),finslerSymbolNode(variable)));
}

function finslerDerivative(node,variable,options){
  var symbol=finslerSymbolNode(variable);
  return options ? math.derivative(node,symbol,options) : math.derivative(node,symbol);
}

function finslerResetFunctions(defs){
  finslerFunctionInfo = Object.create(null);
  finslerBaseByKey = Object.create(null);
  (defs || []).forEach(function(def){
    var info = {
      token:def.token,
      baseToken:def.token,
      name:def.name,
      args:(def.args||[]).slice(),
      multi:[],
      argLabels:(def.argLabels||[]).slice()
    };
    finslerFunctionInfo[info.token]=info;
    finslerBaseByKey[info.name+"\u0000"+info.args.join("\u0001")]=info;
  });
}

function finslerCollectSymbols(node){
  var found=Object.create(null), out=[];
  node.traverse(function(child){
    if(child && child.isSymbolNode && finslerFunctionInfo[child.name] && !found[child.name]){
      found[child.name]=true;
      out.push(child.name);
    }
  });
  return out;
}

function finslerDerivativeToken(info,argIndex){
  var multi=info.multi.slice();
  multi.push(argIndex+1);
  multi.sort(function(a,b){return a-b;});
  var token=info.baseToken+"_d"+multi.join("_");
  if(!finslerFunctionInfo[token]){
    finslerFunctionInfo[token]={
      token:token,
      baseToken:info.baseToken,
      name:info.name,
      args:info.args.slice(),
      multi:multi,
      argLabels:info.argLabels.slice()
    };
  }
  return token;
}

function finslerFindBase(name,args){
  return finslerBaseByKey[name+"\u0000"+args.join("\u0001")] || null;
}

function finslerTokenDerivative(info,variable){
  var terms=[];

  /* Known Bessel identities used by Catalogue §2.6 and §2.11. */
  if(info.multi.length===0 && info.args.length===1 && (info.name==="J0" || info.name==="J1")){
    var darg=finslerNativeD(info.args[0],variable);
    if(isZero(darg)) return "0";
    var mate=finslerFindBase(info.name==="J0"?"J1":"J0",info.args);
    if(mate){
      if(info.name==="J0") return S(mul(neg(mate.token),darg));
      return S(mul(sub(mate.token,div(info.token,info.args[0])),darg));
    }
  }

  for(var j=0;j<info.args.length;j++){
    var da=finslerNativeD(info.args[j],variable);
    if(isZero(da)) continue;
    terms.push(mul(finslerDerivativeToken(info,j),da));
  }
  return terms.length ? S(sum(terms)) : "0";
}

D=function(expr,variable){
  var text=raw(expr);
  if(!Object.keys(finslerFunctionInfo).length) return finslerNativeD(text,variable);
  var key="custom\u0000"+variable+"\u0000"+text;
  if(derivativeCache[key]!==undefined) return derivativeCache[key];

  var node=math.parse(text);
  var pieces=[];
  try{
    pieces.push(finslerDerivative(node,variable,{simplify:false}).toString({parenthesis:"auto"}));
  }catch(e){
    pieces.push(finslerDerivative(node,variable).toString({parenthesis:"auto"}));
  }

  var symbols=finslerCollectSymbols(node);
  for(var s=0;s<symbols.length;s++){
    var token=symbols[s], partial;
    try{
      partial=finslerDerivative(node,token,{simplify:false}).toString({parenthesis:"auto"});
    }catch(e2){
      partial=finslerDerivative(node,token).toString({parenthesis:"auto"});
    }
    if(isZero(partial)) continue;
    var dt=finslerTokenDerivative(finslerFunctionInfo[token],variable);
    if(isZero(dt)) continue;
    pieces.push(mul(partial,dt));
  }

  var value=S(sum(pieces));
  derivativeCache[key]=value;
  return value;
};

onmessage=function(event){
  var data=event.data||{};
  if(data.type!=="calculate") return;
  finslerResetFunctions(data.symbolicFunctions||[]);
  derivativeCache=Object.create(null);
  finslerBaseOnMessage(event);
};