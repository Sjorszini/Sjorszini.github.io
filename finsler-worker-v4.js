"use strict";

importScripts("finsler-worker-v3.js?v=1");

/*
 * v4: symbolic-function support plus a two-level simplification pipeline.
 *
 * 1. S(expr) is the computational simplifier. Its result is stored and reused
 *    by every later tensor calculation, so algebraic junk does not compound.
 * 2. PS(expr) is the stronger presentation simplifier used for final output.
 *
 * Both are built on math.js. For short rational expressions we additionally
 * flatten nested divisions and cancel exact common factors that math.simplify
 * does not always expose by itself.
 */
var finslerBaseS = S;
var finslerBaseInverseMatrix = inverseMatrix;
var finslerBaseOnMessage = onmessage;

var finslerComputeCache = Object.create(null);
var finslerPresentCache = Object.create(null);
var finslerFunctionInfo = Object.create(null);
var finslerBaseByKey = Object.create(null);

function finslerScore(text){return String(text).replace(/\s+/g,"").length;}
function finslerSimplifyText(text){
  try{return math.simplify(String(text)).toString({parenthesis:"auto"});}
  catch(e){return String(text);}
}
function finslerCanonicalNodeText(node){
  try{return math.simplify(node).toString({parenthesis:"auto"});}
  catch(e){return node.toString({parenthesis:"auto"});}
}
function finslerChooseShorter(best,candidate){
  if(!candidate)return best;
  candidate=finslerSimplifyText(candidate);
  return finslerScore(candidate)<finslerScore(best)?candidate:best;
}

function finslerAddFactor(store,node,power){
  if(power<=0)return;
  while(node&&node.isParenthesisNode)node=node.content;
  var text=finslerCanonicalNodeText(node);
  if(text==="1")return;
  if(node&&node.isOperatorNode&&(node.op==="+"||(node.op==="-"&&node.args.length===2))){
    var neg=finslerSimplifyText("-("+text+")");
    if(neg.replace(/\s+/g,"")<text.replace(/\s+/g,"")){
      text=neg;
      if(power%2===1)store.sign*=-1;
    }
  }
  if(!store.map[text]){store.map[text]={text:text,power:0};store.order.push(text);}
  store.map[text].power+=power;
}
function finslerMergeFactors(target,source,mult){
  mult=mult||1;
  if(source.sign<0&&mult%2===1)target.sign*=-1;
  source.order.forEach(function(key){
    var entry=source.map[key];
    if(!target.map[key]){target.map[key]={text:entry.text,power:0};target.order.push(key);}
    target.map[key].power+=entry.power*mult;
  });
}
function finslerTermFactors(node){
  var out={sign:1,map:Object.create(null),order:[]};
  function walk(n,mult){
    while(n&&n.isParenthesisNode)n=n.content;
    if(!n)return;
    if(n.isOperatorNode&&n.op==="-"&&n.args.length===1&&mult===1){out.sign*=-1;walk(n.args[0],1);return;}
    if(n.isOperatorNode&&n.op==="*"&&mult===1){n.args.forEach(function(arg){walk(arg,1);});return;}
    if(n.isOperatorNode&&n.op==="^"&&n.args.length===2&&n.args[1].isConstantNode){
      var p=Number(n.args[1].value);
      if(Number.isInteger(p)&&p>0){walk(n.args[0],mult*p);return;}
    }
    if(n.isOperatorNode&&(n.op==="+"||(n.op==="-"&&n.args.length===2))){
      finslerMergeFactors(out,finslerFactorExpression(n),mult);return;
    }
    finslerAddFactor(out,n,mult);
  }
  walk(node,1);return out;
}
function finslerCollectSumTerms(node,sign,out){
  while(node&&node.isParenthesisNode)node=node.content;
  if(node&&node.isOperatorNode){
    if(node.op==="+"&&node.args.length===2){finslerCollectSumTerms(node.args[0],sign,out);finslerCollectSumTerms(node.args[1],sign,out);return;}
    if(node.op==="-"&&node.args.length===2){finslerCollectSumTerms(node.args[0],sign,out);finslerCollectSumTerms(node.args[1],-sign,out);return;}
    if(node.op==="-"&&node.args.length===1){finslerCollectSumTerms(node.args[0],-sign,out);return;}
  }
  out.push({node:node,sign:sign});
}
function finslerProductText(factors,removed){
  var parts=[];
  factors.order.forEach(function(key){
    var have=factors.map[key]?factors.map[key].power:0;
    var take=removed&&removed[key]?removed[key]:0;
    var p=have-take;if(p<=0)return;
    var atom=factors.map[key].text;
    parts.push(p===1?"("+atom+")":"("+atom+")^"+p);
  });
  return parts.length?parts.join("*"):"1";
}
function finslerFactorExpression(node){
  var terms=[];finslerCollectSumTerms(node,1,terms);
  if(terms.length<=1)return finslerTermFactors(node);
  var factored=terms.map(function(term){var f=finslerTermFactors(term.node);f.sign*=term.sign;return f;});
  var common=Object.create(null),commonKeys=[];
  factored[0].order.forEach(function(key){
    var p=factored[0].map[key].power;
    for(var i=1;i<factored.length;i++)p=Math.min(p,factored[i].map[key]?factored[i].map[key].power:0);
    if(p>0){common[key]=p;commonKeys.push(key);}
  });
  if(!commonKeys.length){var whole={sign:1,map:Object.create(null),order:[]};finslerAddFactor(whole,node,1);return whole;}
  var residual=factored.map(function(f){var body=finslerProductText(f,common);return f.sign<0?"-("+body+")":"("+body+")";}).join("+");
  residual=finslerSimplifyText(residual);
  var result={sign:1,map:Object.create(null),order:[]};
  commonKeys.forEach(function(key){result.map[key]={text:factored[0].map[key].text,power:common[key]};result.order.push(key);});
  if(residual!=="1"){try{finslerAddFactor(result,math.parse(residual),1);}catch(e){}}
  return result;
}
function finslerPair(num,den){return {num:finslerSimplifyText(num),den:finslerSimplifyText(den)};}
function finslerRationalPair(node){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return finslerPair("0","1");
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){var u=finslerRationalPair(node.args[0]);return finslerPair("-("+u.num+")",u.den);}
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerRationalPair(node.args[0]),b=finslerRationalPair(node.args[1]);
      return finslerPair("("+a.num+")*("+b.den+")"+node.op+"("+b.num+")*("+a.den+")","("+a.den+")*("+b.den+")");
    }
    if(node.op==="*"&&node.args.length===2){var m1=finslerRationalPair(node.args[0]),m2=finslerRationalPair(node.args[1]);return finslerPair("("+m1.num+")*("+m2.num+")","("+m1.den+")*("+m2.den+")");}
    if(node.op==="/"&&node.args.length===2){var d1=finslerRationalPair(node.args[0]),d2=finslerRationalPair(node.args[1]);return finslerPair("("+d1.num+")*("+d2.den+")","("+d1.den+")*("+d2.num+")");}
    if(node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var p=Number(node.args[1].value);
      if(Number.isInteger(p)){
        var base=finslerRationalPair(node.args[0]),q=Math.abs(p);
        return p>=0?finslerPair("("+base.num+")^("+q+")","("+base.den+")^("+q+")"):finslerPair("("+base.den+")^("+q+")","("+base.num+")^("+q+")");
      }
    }
  }
  return finslerPair(finslerCanonicalNodeText(node),"1");
}
function finslerCancelDeepRational(text){
  var node;try{node=math.parse(String(text));}catch(e){return null;}
  var pair=finslerRationalPair(node),numNode,denNode;
  try{numNode=math.parse(pair.num);denNode=math.parse(pair.den);}catch(e2){return null;}
  var numerator=finslerFactorExpression(numNode),denominator=finslerFactorExpression(denNode);
  var cancel=Object.create(null),cancelled=false;
  numerator.order.forEach(function(key){
    if(!denominator.map[key])return;
    var p=Math.min(numerator.map[key].power,denominator.map[key].power);
    if(p>0){cancel[key]=p;cancelled=true;}
  });
  var num=finslerProductText(numerator,cancel),den=finslerProductText(denominator,cancel);
  if(numerator.sign*denominator.sign<0)num="-("+num+")";
  var candidate=finslerSimplifyText(den==="1"?num:"("+num+")/("+den+")");
  if(!cancelled&&finslerScore(candidate)>=finslerScore(text))return null;
  return candidate;
}

/* Moderate canonicalization used by all subsequent calculations. Keep this
 * deliberately cheaper than final presentation simplification. */
function finslerComputationalExpression(expr){
  var original=raw(expr);
  if(finslerComputeCache[original]!==undefined)return finslerComputeCache[original];
  var best=finslerBaseS(original);
  var compact=finslerScore(best);
  if(compact<=420&&best.indexOf("/")!==-1){
    best=finslerChooseShorter(best,finslerCancelDeepRational(best));
    if(typeof math.rationalize==="function"&&finslerScore(best)<=280){
      try{
        var rational=math.rationalize(best).toString({parenthesis:"auto"});
        best=finslerChooseShorter(best,rational);
        best=finslerChooseShorter(best,finslerCancelDeepRational(rational));
      }catch(e){}
    }
  }
  finslerComputeCache[original]=best;
  finslerComputeCache[best]=best;
  return best;
}
S=finslerComputationalExpression;

/* Stronger cached final-output simplification. */
PS=function(expr){
  var original=raw(expr);
  if(finslerPresentCache[original]!==undefined)return finslerPresentCache[original];
  var best=S(original),current=best;
  for(var pass=0;pass<3;pass++){
    var simplified=finslerSimplifyText(current);
    best=finslerChooseShorter(best,simplified);
    if(simplified===current)break;
    current=simplified;
  }
  if(finslerScore(best)<=6000)best=finslerChooseShorter(best,finslerCancelDeepRational(best));
  if(typeof math.rationalize==="function"&&finslerScore(best)<=1800){
    try{
      var rational=math.rationalize(best).toString({parenthesis:"auto"});
      best=finslerChooseShorter(best,rational);
      best=finslerChooseShorter(best,finslerCancelDeepRational(rational));
    }catch(e){}
  }
  finslerPresentCache[original]=best;
  finslerPresentCache[best]=best;
  return best;
};

/* Symbolic adjugate inversion is wasteful for diagonal metrics (including
 * Schwarzschild) and creates exactly the large cancellable fractions that slow
 * every later derivative. Invert diagonal metrics directly and keep those
 * simplified entries as the computational state. */
inverseMatrix=function(matrix){
  var n=matrix.length,diagonal=true,i,j;
  for(i=0;i<n&&diagonal;i++)for(j=0;j<n;j++)if(i!==j&&!isZero(matrix[i][j])){diagonal=false;break;}
  if(!diagonal){
    var general=finslerBaseInverseMatrix(matrix);
    for(i=0;i<n;i++)for(j=0;j<n;j++)general.matrix[i][j]=S(general.matrix[i][j]);
    general.det=S(general.det);
    return general;
  }
  var inv=[],factors=[];
  for(i=0;i<n;i++){
    inv[i]=new Array(n).fill("0");
    var d=S(matrix[i][i]);
    if(isZero(d))throw new Error("The metric/fundamental tensor is degenerate.");
    inv[i][i]=S(div("1",d));
    factors.push(d);
  }
  return {matrix:inv,det:S(factors.reduce(function(a,b){return mul(a,b);},"1"))};
};

function finslerFinalTree(value){
  if(typeof value==="string")return PS(value);
  if(Array.isArray(value))return value.map(finslerFinalTree);
  if(value&&typeof value==="object"){
    var out={};Object.keys(value).forEach(function(key){out[key]=finslerFinalTree(value[key]);});return out;
  }
  return value;
}

/* Catch any output path that bypasses emit(); cached PS() makes this effectively
 * free for values that were already simplified by emit()/simplifySummary(). */
var finslerNativePostMessage=self.postMessage.bind(self);
self.postMessage=function(message,transfer){
  var outgoing=message;
  if(message&&message.type==="component"&&typeof message.value==="string")outgoing=Object.assign({},message,{value:PS(message.value)});
  else if(message&&message.type==="sectionComplete"&&message.summary)outgoing=Object.assign({},message,{summary:finslerFinalTree(message.summary)});
  if(transfer!==undefined)return finslerNativePostMessage(outgoing,transfer);
  return finslerNativePostMessage(outgoing);
};

function finslerSymbolNode(variable){
  var symbol=math.parse(String(variable));
  if(!symbol||!symbol.isSymbolNode)throw new Error("Invalid differentiation variable: "+variable);
  return symbol;
}
function finslerNativeD(expr,variable){return S(math.derivative(math.parse(raw(expr)),finslerSymbolNode(variable)));}
function finslerDerivative(node,variable,options){var symbol=finslerSymbolNode(variable);return options?math.derivative(node,symbol,options):math.derivative(node,symbol);}
function finslerResetFunctions(defs){
  finslerFunctionInfo=Object.create(null);finslerBaseByKey=Object.create(null);
  (defs||[]).forEach(function(def){
    var info={token:def.token,baseToken:def.token,name:def.name,args:(def.args||[]).slice(),multi:[],argLabels:(def.argLabels||[]).slice()};
    finslerFunctionInfo[info.token]=info;finslerBaseByKey[info.name+"\u0000"+info.args.join("\u0001")]=info;
  });
}
function finslerCollectSymbols(node){
  var found=Object.create(null),out=[];
  node.traverse(function(child){if(child&&child.isSymbolNode&&finslerFunctionInfo[child.name]&&!found[child.name]){found[child.name]=true;out.push(child.name);}});
  return out;
}
function finslerDerivativeToken(info,argIndex){
  var multi=info.multi.slice();multi.push(argIndex+1);multi.sort(function(a,b){return a-b;});
  var token=info.baseToken+"_d"+multi.join("_");
  if(!finslerFunctionInfo[token])finslerFunctionInfo[token]={token:token,baseToken:info.baseToken,name:info.name,args:info.args.slice(),multi:multi,argLabels:info.argLabels.slice()};
  return token;
}
function finslerFindBase(name,args){return finslerBaseByKey[name+"\u0000"+args.join("\u0001")]||null;}
function finslerTokenDerivative(info,variable){
  var terms=[];
  if(info.multi.length===0&&info.args.length===1&&(info.name==="J0"||info.name==="J1")){
    var darg=finslerNativeD(info.args[0],variable);if(isZero(darg))return "0";
    var mate=finslerFindBase(info.name==="J0"?"J1":"J0",info.args);
    if(mate){if(info.name==="J0")return S(mul(neg(mate.token),darg));return S(mul(sub(mate.token,div(info.token,info.args[0])),darg));}
  }
  for(var j=0;j<info.args.length;j++){
    var da=finslerNativeD(info.args[j],variable);if(isZero(da))continue;
    terms.push(mul(finslerDerivativeToken(info,j),da));
  }
  return terms.length?S(sum(terms)):"0";
}

D=function(expr,variable){
  var text=raw(expr);
  if(!Object.keys(finslerFunctionInfo).length)return finslerNativeD(text,variable);
  var key="custom\u0000"+variable+"\u0000"+text;
  if(derivativeCache[key]!==undefined)return derivativeCache[key];
  var node=math.parse(text),pieces=[];
  try{pieces.push(finslerDerivative(node,variable,{simplify:false}).toString({parenthesis:"auto"}));}
  catch(e){pieces.push(finslerDerivative(node,variable).toString({parenthesis:"auto"}));}
  var symbols=finslerCollectSymbols(node);
  for(var s=0;s<symbols.length;s++){
    var token=symbols[s],partial;
    try{partial=finslerDerivative(node,token,{simplify:false}).toString({parenthesis:"auto"});}
    catch(e2){partial=finslerDerivative(node,token).toString({parenthesis:"auto"});}
    if(isZero(partial))continue;
    var dt=finslerTokenDerivative(finslerFunctionInfo[token],variable);if(isZero(dt))continue;
    pieces.push(mul(partial,dt));
  }
  var value=S(sum(pieces));derivativeCache[key]=value;return value;
};

onmessage=function(event){
  var data=event.data||{};if(data.type!=="calculate")return;
  finslerResetFunctions(data.symbolicFunctions||[]);
  derivativeCache=Object.create(null);
  finslerComputeCache=Object.create(null);
  finslerPresentCache=Object.create(null);
  finslerBaseOnMessage(event);
};
