"use strict";

/*
 * Finsler worker v4 — verified geometry + conservative presentation CAS.
 *
 * The tensor engine is the independently checked v3 implementation. Its
 * computational simplifier stays on math.js so later derivatives/contractions
 * cannot be corrupted by heuristic rewrites. A separate bounded Nerdamer
 * pass is used only for emitted expressions; every CAS rewrite is numerically
 * checked at several generic points before it is accepted.
 */
importScripts("finsler-worker-v3.js?v=1");
try{importScripts("https://cdn.jsdelivr.net/npm/nerdamer-prime@1.5.0/all.min.js");}catch(e){}

var finslerBaseS=S;
var finslerBaseInverseMatrix=inverseMatrix;
var finslerBaseOnMessage=onmessage;
var finslerNativePostMessage=self.postMessage.bind(self);
var finslerComputeCache=Object.create(null);
var finslerPresentCache=Object.create(null);
var finslerSubtreeCache=Object.create(null);
var finslerFunctionInfo=Object.create(null);
var finslerBaseByKey=Object.create(null);

var FINSLER_STANDARD_NAMES={
  sin:1,cos:1,tan:1,asin:1,acos:1,atan:1,atan2:1,
  sinh:1,cosh:1,tanh:1,exp:1,log:1,ln:1,sqrt:1,abs:1,
  min:1,max:1,sign:1,pi:1,e:1,i:1,Infinity:1
};

function finslerCompactLength(text){return String(text).replace(/\s+/g,"").length;}
function finslerOpCount(text){var m=String(text).match(/[+\-*/^]/g);return m?m.length:0;}
function finslerAddCount(text){var m=String(text).match(/[+\-]/g);return m?m.length:0;}

function finslerSymbols(text){
  var out=[],seen=Object.create(null),node;
  try{node=math.parse(String(text));}catch(e){return out;}
  node.traverse(function(child){
    if(!child||!child.isSymbolNode)return;
    var name=child.name;
    if(FINSLER_STANDARD_NAMES[name]||seen[name])return;
    seen[name]=1;out.push(name);
  });
  return out.sort();
}
function finslerScope(names,k){
  var scope=Object.create(null);
  names.forEach(function(name,index){
    var value=1.17+0.19*index+0.13*k;
    var m=/^x(\d+)$/.exec(name);
    if(m){
      var n=Number(m[1]);
      value=n===1?0.31+0.11*k:n===2?7.0+2.0*k:n===3?0.73+0.17*k:0.43+0.09*k+0.2*n;
    }else if(/^y\d+$/.test(name))value=0.83+0.21*index+0.08*k;
    else if(name==="rs")value=2.0+0.25*k;
    else if(name==="M")value=1.0+0.15*k;
    else if(/^__uf/.test(name))value=1.4+0.16*index+0.07*k;
    scope[name]=value;
  });
  return scope;
}
function finslerMagnitude(value){try{return Number(math.abs(value));}catch(e){return NaN;}}
function finslerEquivalentNumerically(a,b){
  if(String(a)===String(b))return true;
  var names=finslerSymbols("("+a+")+("+b+")"),success=0;
  for(var k=0;k<5;k++){
    var scope=finslerScope(names,k),av,bv,delta,scale;
    try{
      av=math.evaluate(String(a),scope);bv=math.evaluate(String(b),scope);
      delta=finslerMagnitude(math.subtract(av,bv));
      scale=Math.max(1,finslerMagnitude(av),finslerMagnitude(bv));
    }catch(e){continue;}
    if(!Number.isFinite(delta)||!Number.isFinite(scale))continue;
    success++;
    if(delta>2e-9*scale)return false;
  }
  return success>=3;
}

function finslerNerdamerCandidate(text,relaxed){
  if(typeof nerdamer!=="function")return null;
  text=String(text);
  var length=finslerCompactLength(text),ops=finslerOpCount(text);
  var maxLength=relaxed?330:220,maxOps=relaxed?42:28;
  if(length>maxLength||ops>maxOps)return null;
  try{
    var candidate=nerdamer("simplify("+text+")").toString();
    if(!candidate)return null;
    if(finslerCompactLength(candidate)<=190&&finslerOpCount(candidate)<=22){
      try{
        var factored=nerdamer("factor("+candidate+")").toString();
        if(factored&&finslerCompactLength(factored)<=finslerCompactLength(candidate)+10)candidate=factored;
      }catch(e2){}
    }
    return candidate;
  }catch(e){return null;}
}
function finslerPrefer(base,candidate,allowTie){
  if(!candidate||!finslerEquivalentNumerically(base,candidate))return base;
  var a=finslerCompactLength(base),b=finslerCompactLength(candidate);
  if(b<a)return candidate;
  if(allowTie&&b<=a+12&&finslerAddCount(candidate)<finslerAddCount(base))return candidate;
  return base;
}

function finslerFractionForm(text){
  var root;try{root=math.parse(String(text));}catch(e){return String(text);}
  var num=[],den=[],sign=1;
  function put(node,toDen){
    while(node&&node.isParenthesisNode)node=node.content;
    if(!node)return;
    if(node.isOperatorNode&&node.op==="-"&&node.args.length===1){sign*=-1;put(node.args[0],toDen);return;}
    if(node.isOperatorNode&&node.op==="*"&&node.args.length>=2){node.args.forEach(function(a){put(a,toDen);});return;}
    if(node.isOperatorNode&&node.op==="/"&&node.args.length===2){put(node.args[0],toDen);put(node.args[1],!toDen);return;}
    if(node.isOperatorNode&&node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var p=Number(node.args[1].value);
      if(Number.isInteger(p)&&p<0){
        var q=-p,base=node.args[0].toString({parenthesis:"auto"});
        (toDen?num:den).push(q===1?base:"("+base+")^"+q);return;
      }
    }
    var atom=node.toString({parenthesis:"auto"});
    if(atom==="1")return;
    if(atom==="-1"){sign*=-1;return;}
    (toDen?den:num).push(atom);
  }
  put(root,false);
  if(!den.length)return String(text);
  function rank(atom){
    if(/^[A-Za-z_]\w*$/.test(atom))return 0;
    if(/^[A-Za-z_]\w*\s*\^/.test(atom))return 1;
    if(/^[A-Za-z_]\w*\s*\(/.test(atom))return 2;
    if(/[+\-]/.test(atom.replace(/^[-+]/,"")))return 4;
    return 3;
  }
  num.sort(function(a,b){return rank(a)-rank(b)||a.localeCompare(b);});
  den.sort(function(a,b){
    var an=/^[0-9.]+$/.test(a),bn=/^[0-9.]+$/.test(b);
    if(an!==bn)return an?-1:1;
    return rank(a)-rank(b)||a.localeCompare(b);
  });
  function factor(atom){
    var node;try{node=math.parse(atom);}catch(e){return "("+atom+")";}
    while(node&&node.isParenthesisNode)node=node.content;
    if(node&&(node.isSymbolNode||node.isConstantNode||node.isFunctionNode))return atom;
    if(node&&node.isOperatorNode&&node.op==="^"&&node.args.length===2)return atom;
    return "("+atom+")";
  }
  var ntext=num.length?num.map(factor).join("*"):"1";
  var dtext=den.map(factor).join("*");
  if(sign<0)ntext="-"+ntext;
  return dtext?ntext+"/("+dtext+")":ntext;
}

function finslerSimplifyNode(node,depth){
  if(!node)return node;
  var mapped=node;
  if(typeof node.map==="function"){
    try{mapped=node.map(function(child){return finslerSimplifyNode(child,depth+1);});}catch(e){}
  }
  var text;
  try{text=mapped.toString({parenthesis:"auto"});}catch(e2){return mapped;}
  var key=(depth<2?"R":"S")+"\u0000"+text;
  if(finslerSubtreeCache[key]!==undefined){
    try{return math.parse(finslerSubtreeCache[key]);}catch(e3){return mapped;}
  }
  var candidate=finslerNerdamerCandidate(text,depth<2);
  var best=finslerPrefer(text,candidate,true);
  if(candidate&&candidate!==best)best=text;
  best=finslerFractionForm(best);
  if(!finslerEquivalentNumerically(text,best))best=text;
  finslerSubtreeCache[key]=best;
  try{return math.parse(best);}catch(e4){return mapped;}
}

S=function(expr){
  var original=raw(expr);
  if(finslerComputeCache[original]!==undefined)return finslerComputeCache[original];
  var best=finslerBaseS(original);
  finslerComputeCache[original]=best;
  finslerComputeCache[best]=best;
  return best;
};

PS=function(expr){
  var original=raw(expr);
  if(finslerPresentCache[original]!==undefined)return finslerPresentCache[original];
  var base=S(original),node,best=base;
  try{node=math.parse(base);best=finslerSimplifyNode(node,0).toString({parenthesis:"auto"});}catch(e){}
  var direct=finslerNerdamerCandidate(best,true);
  best=finslerPrefer(best,direct,true);
  best=finslerFractionForm(best);
  if(!finslerEquivalentNumerically(base,best))best=base;
  finslerPresentCache[original]=best;
  finslerPresentCache[best]=best;
  return best;
};

inverseMatrix=function(matrix){
  var n=matrix.length,diagonal=true,i,j;
  for(i=0;i<n&&diagonal;i++)for(j=0;j<n;j++)if(i!==j&&!isZero(matrix[i][j])){diagonal=false;break;}
  if(!diagonal)return finslerBaseInverseMatrix(matrix);
  var inv=[],factors=[];
  for(i=0;i<n;i++){
    inv[i]=new Array(n).fill("0");
    var d=S(matrix[i][i]);
    if(isZero(d))throw new Error("The metric/fundamental tensor is degenerate.");
    inv[i][i]=S(div("1",d));factors.push(d);
  }
  return {matrix:inv,det:S(factors.reduce(function(a,b){return mul(a,b);},"1"))};
};

function finslerFinalTree(value){
  if(typeof value==="string")return PS(value);
  if(Array.isArray(value))return value.map(finslerFinalTree);
  if(value&&typeof value==="object"){var out={};Object.keys(value).forEach(function(key){out[key]=finslerFinalTree(value[key]);});return out;}
  return value;
}
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
    finslerFunctionInfo[info.token]=info;
    finslerBaseByKey[info.name+"\u0000"+info.args.join("\u0001")]=info;
  });
}
function finslerCollectFunctionSymbols(node){
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
  var symbols=finslerCollectFunctionSymbols(node);
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
  finslerSubtreeCache=Object.create(null);
  finslerBaseOnMessage(event);
};