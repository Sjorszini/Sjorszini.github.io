"use strict";

/*
 * Finsler worker v4 — verified tensor engine + guarded canonical algebra.
 *
 * finsler-worker-v4-base.js supplies the verified v3 geometry formulas,
 * symbolic-function differentiation, diagonal inversion, and the final
 * postMessage gateway.  This file replaces only S() and PS():
 *
 *   S(expr): cheap computational canonicalization.  Only tiny factorable
 *   expressions are sent to the external CAS, so compact Christoffels are
 *   actually reused by spray/curvature calculations without making every
 *   intermediate CAS-bound.
 *
 *   PS(expr): stronger final-output canonicalization.  It recursively reduces
 *   rational subexpressions and combines exact equal/opposite denominators,
 *   then uses Nerdamer on bounded pieces.  Every accepted rewrite is checked
 *   numerically at several generic points before it is emitted.
 */
importScripts("finsler-worker-v4-base.js?v=2");
try{importScripts("https://cdn.jsdelivr.net/npm/nerdamer-prime@1.5.0/all.min.js");}catch(e){}

var finslerV4BaseOnMessage=onmessage;
var finslerV4SubtreeCache=Object.create(null);
var FINSLER_V4_STANDARD={
  sin:1,cos:1,tan:1,asin:1,acos:1,atan:1,atan2:1,
  sinh:1,cosh:1,tanh:1,exp:1,log:1,ln:1,sqrt:1,abs:1,
  min:1,max:1,sign:1,pi:1,e:1,i:1,Infinity:1
};

function finslerV4Compact(text){return String(text).replace(/\s+/g,"");}
function finslerV4Length(text){return finslerV4Compact(text).length;}
function finslerV4Ops(text){var m=String(text).match(/[+\-*/^]/g);return m?m.length:0;}
function finslerV4Adds(text){var m=String(text).match(/[+\-]/g);return m?m.length:0;}
function finslerV4FactoredAdds(text){
  var node,count=0;
  try{node=math.parse(String(text));}catch(e){return 0;}
  node.traverse(function(child){
    if(!child||!child.isOperatorNode||child.op!=="*")return;
    for(var i=0;i<child.args.length;i++){
      var a=child.args[i];while(a&&a.isParenthesisNode)a=a.content;
      if(a&&a.isOperatorNode&&(a.op==="+"||(a.op==="-"&&a.args.length===2))){count++;break;}
    }
  });
  return count;
}
function finslerV4Symbols(text){
  var out=[],seen=Object.create(null),node;
  try{node=math.parse(String(text));}catch(e){return out;}
  node.traverse(function(child){
    if(!child||!child.isSymbolNode)return;
    var name=child.name;if(FINSLER_V4_STANDARD[name]||seen[name])return;
    seen[name]=1;out.push(name);
  });
  return out.sort();
}
function finslerV4Scope(names,k){
  var scope={};
  names.forEach(function(name,index){
    var value=1.17+0.19*index+0.13*k,m=/^x(\d+)$/.exec(name);
    if(m){var n=Number(m[1]);value=n===1?0.31+0.11*k:n===2?7+2*k:n===3?0.73+0.17*k:0.43+0.09*k+0.2*n;}
    else if(/^y\d+$/.test(name))value=0.83+0.21*index+0.08*k;
    else if(name==="rs")value=2+0.25*k;
    else if(name==="M")value=1+0.15*k;
    else if(/^__uf/.test(name))value=1.4+0.16*index+0.07*k;
    scope[name]=value;
  });
  return scope;
}
function finslerV4Magnitude(v){try{return Number(math.abs(v));}catch(e){return NaN;}}
function finslerV4Equivalent(a,b){
  if(String(a)===String(b))return true;
  var names=finslerV4Symbols("("+a+")+("+b+")"),success=0;
  for(var k=0;k<5;k++){
    var av,bv,delta,scale,scope=finslerV4Scope(names,k);
    try{av=math.evaluate(String(a),scope);bv=math.evaluate(String(b),scope);delta=finslerV4Magnitude(math.subtract(av,bv));scale=Math.max(1,finslerV4Magnitude(av),finslerV4Magnitude(bv));}catch(e){continue;}
    if(!Number.isFinite(delta)||!Number.isFinite(scale))continue;
    success++;if(delta>2e-9*scale)return false;
  }
  return success>=3;
}

function finslerV4NerdamerCandidate(text,relaxed){
  if(typeof nerdamer!=="function")return null;
  text=String(text);
  var length=finslerV4Length(text),ops=finslerV4Ops(text),maxLength=relaxed?380:220,maxOps=relaxed?52:28;
  if(length>maxLength||ops>maxOps)return null;
  try{
    var candidate=nerdamer("simplify("+text+")").toString();
    if(!candidate)return null;
    if(finslerV4Length(candidate)<=220&&finslerV4Ops(candidate)<=26){
      try{var factored=nerdamer("factor("+candidate+")").toString();if(factored&&finslerV4Length(factored)<=finslerV4Length(candidate)+10)candidate=factored;}catch(e2){}
    }
    return candidate;
  }catch(e){return null;}
}
function finslerV4FactorCandidate(text){
  if(typeof nerdamer!=="function")return null;
  try{return nerdamer("factor("+String(text)+")").toString();}catch(e){return null;}
}
function finslerV4Prefer(base,candidate,allowFactor){
  if(!candidate||!finslerV4Equivalent(base,candidate))return base;
  var a=finslerV4Length(base),b=finslerV4Length(candidate);
  if(b<a)return candidate;
  if(allowFactor&&a<=52&&b<=a+14&&finslerV4FactoredAdds(candidate)>finslerV4FactoredAdds(base))return candidate;
  if(allowFactor&&a<=52&&b<=a+10&&finslerV4Adds(candidate)<finslerV4Adds(base))return candidate;
  return base;
}
function finslerV4IntegerExponent(node){
  while(node&&node.isParenthesisNode)node=node.content;
  if(node&&node.isConstantNode){var n=Number(node.value);return Number.isInteger(n)?n:null;}
  if(node&&node.isOperatorNode&&node.op==="-"&&node.args.length===1){var a=node.args[0];while(a&&a.isParenthesisNode)a=a.content;if(a&&a.isConstantNode){var m=-Number(a.value);return Number.isInteger(m)?m:null;}}
  return null;
}
function finslerV4FactorRelation(a,b){
  try{
    var same=math.simplify("("+a+")-("+b+")").toString({parenthesis:"auto"}).replace(/\s+/g,"");if(same==="0")return 1;
    var opposite=math.simplify("("+a+")+("+b+")").toString({parenthesis:"auto"}).replace(/\s+/g,"");if(opposite==="0")return -1;
  }catch(e){}
  return 0;
}
function finslerV4FractionForm(text){
  var root;try{root=math.parse(String(text));}catch(e){return String(text);}
  var num=[],den=[],sign=1;
  function put(node,toDen){
    while(node&&node.isParenthesisNode)node=node.content;if(!node)return;
    if(node.isOperatorNode&&node.op==="-"&&node.args.length===1){sign*=-1;put(node.args[0],toDen);return;}
    if(node.isOperatorNode&&node.op==="*"&&node.args.length>=2){node.args.forEach(function(a){put(a,toDen);});return;}
    if(node.isOperatorNode&&node.op==="/"&&node.args.length===2){put(node.args[0],toDen);put(node.args[1],!toDen);return;}
    if(node.isOperatorNode&&node.op==="^"&&node.args.length===2){var p=finslerV4IntegerExponent(node.args[1]);if(p!==null&&p<0){var q=-p,base=node.args[0].toString({parenthesis:"auto"});(toDen?num:den).push(q===1?base:"("+base+")^"+q);return;}}
    var atom=node.toString({parenthesis:"auto"});if(atom==="1")return;if(atom==="-1"){sign*=-1;return;}(toDen?den:num).push(atom);
  }
  put(root,false);if(!den.length)return String(text);
  for(var ni=num.length-1;ni>=0;ni--)for(var di=den.length-1;di>=0;di--){var rel=finslerV4FactorRelation(num[ni],den[di]);if(!rel)continue;num.splice(ni,1);den.splice(di,1);if(rel<0)sign*=-1;break;}
  function rank(atom){if(/^[0-9.]+$/.test(atom))return -1;if(/^[A-Za-z_]\w*$/.test(atom))return 0;if(/^[A-Za-z_]\w*\s*\^/.test(atom))return 1;if(/^[A-Za-z_]\w*\s*\(/.test(atom))return 2;if(/[+\-]/.test(atom.replace(/^[-+]/,"")))return 4;return 3;}
  num.sort(function(a,b){return rank(a)-rank(b)||a.localeCompare(b);});den.sort(function(a,b){return rank(a)-rank(b)||a.localeCompare(b);});
  function factor(atom){var node;try{node=math.parse(atom);}catch(e){return "("+atom+")";}while(node&&node.isParenthesisNode)node=node.content;if(node&&(node.isSymbolNode||node.isConstantNode||node.isFunctionNode))return atom;if(node&&node.isOperatorNode&&node.op==="^"&&node.args.length===2)return atom;return "("+atom+")";}
  var ntext=num.length?num.map(factor).join("*"):"1",dtext=den.map(factor).join("*");if(sign<0)ntext="-"+ntext;return dtext?ntext+"/("+dtext+")":ntext;
}
function finslerV4TopFractionParts(text){
  var normalized=finslerV4FractionForm(text),node,sign=1;try{node=math.parse(normalized);}catch(e){return null;}while(node&&node.isParenthesisNode)node=node.content;
  if(node&&node.isOperatorNode&&node.op==="-"&&node.args.length===1){sign=-1;node=node.args[0];while(node&&node.isParenthesisNode)node=node.content;}
  if(node&&node.isOperatorNode&&node.op==="/"&&node.args.length===2){var n=node.args[0].toString({parenthesis:"auto"});if(sign<0)n="-("+n+")";return {num:n,den:node.args[1].toString({parenthesis:"auto"})};}
  return {num:sign<0?"-("+node.toString({parenthesis:"auto"})+")":node.toString({parenthesis:"auto"}),den:"1"};
}
function finslerV4CombineAlignedFractionNode(node){
  var n=node;while(n&&n.isParenthesisNode)n=n.content;
  if(!n||!n.isOperatorNode||!(n.op==="+"||(n.op==="-"&&n.args.length===2))||n.args.length!==2)return null;
  var left=finslerV4TopFractionParts(n.args[0].toString({parenthesis:"auto"})),right=finslerV4TopFractionParts(n.args[1].toString({parenthesis:"auto"}));
  if(!left||!right||left.den==="1"||right.den==="1")return null;
  var rel=finslerV4FactorRelation(left.den,right.den);if(!rel)return null;
  var second=(n.op==="-"?-1:1)*rel,numerator;
  try{numerator=math.simplify("("+left.num+")+"+second+"*("+right.num+")").toString({parenthesis:"auto"});}catch(e){return null;}
  if(numerator.replace(/\s+/g,"")==="0")return "0";
  var candidate;try{candidate=math.simplify("("+numerator+")/("+left.den+")").toString({parenthesis:"auto"});}catch(e2){candidate="("+numerator+")/("+left.den+")";}
  candidate=finslerV4FractionForm(candidate);var original=n.toString({parenthesis:"auto"});
  if(!finslerV4Equivalent(original,candidate))return null;return finslerV4Length(candidate)<finslerV4Length(original)?candidate:null;
}
function finslerV4SimplifyNode(node,depth){
  if(!node)return node;var mapped=node;
  if(typeof node.map==="function")try{mapped=node.map(function(child){return finslerV4SimplifyNode(child,depth+1);});}catch(e){}
  var aligned=finslerV4CombineAlignedFractionNode(mapped);if(aligned!==null)try{mapped=math.parse(aligned);}catch(e0){}
  var text;try{text=mapped.toString({parenthesis:"auto"});}catch(e2){return mapped;}
  var key=(depth<2?"R":"S")+"\u0000"+text;if(finslerV4SubtreeCache[key]!==undefined)try{return math.parse(finslerV4SubtreeCache[key]);}catch(e3){return mapped;}
  var candidate=finslerV4NerdamerCandidate(text,depth<2);if(candidate)candidate=finslerV4FractionForm(candidate);
  var best=finslerV4Prefer(text,candidate,true);best=finslerV4FractionForm(best);if(!finslerV4Equivalent(text,best))best=text;
  finslerV4SubtreeCache[key]=best;try{return math.parse(best);}catch(e4){return mapped;}
}
function finslerV4LocalProductStep(current,reference){
  var node;try{node=math.parse(current);}catch(e){return current;}while(node&&node.isParenthesisNode)node=node.content;
  if(!node||!node.isOperatorNode||node.op!=="*"||node.args.length<2)return current;
  var parts=[],changed=false;
  for(var i=0;i<node.args.length;i++){
    var text=node.args[i].toString({parenthesis:"auto"}),candidate=finslerV4NerdamerCandidate(text,true);if(candidate)candidate=finslerV4FractionForm(candidate);
    var best=finslerV4Prefer(text,candidate,true);
    if(best===text&&finslerV4Length(text)>18&&finslerV4Length(text)<=300)try{var rec=finslerV4SimplifyNode(node.args[i],0).toString({parenthesis:"auto"});rec=finslerV4FractionForm(rec);best=finslerV4Prefer(text,rec,true);}catch(e2){}
    if(best!==text)changed=true;parts.push("("+best+")");
  }
  if(!changed)return current;var rebuilt=finslerV4FractionForm(parts.join("*"));if(!finslerV4Equivalent(reference,rebuilt))return current;return finslerV4Length(rebuilt)<finslerV4Length(current)?rebuilt:current;
}

/* Cheap computational factoring: only very small expressions are CAS-bound.
 * This catches e.g. (r*rs-rs^2)/(2*r^3) -> rs*(r-rs)/(2*r^3), and that
 * factored result is what subsequent spray/curvature calculations consume. */
S=function(expr){
  var original=raw(expr);if(finslerComputeCache[original]!==undefined)return finslerComputeCache[original];
  var base=finslerBaseS(original),best=base,compact=finslerV4Compact(base);
  if(finslerV4Length(base)<=58&&finslerV4Ops(base)<=9&&/[+\-]/.test(compact.replace(/^[-+]/,""))&&/[*/^]/.test(compact)){
    var candidate=finslerV4FactorCandidate(base);if(candidate)candidate=finslerV4FractionForm(candidate);best=finslerV4Prefer(base,candidate,true);
  }
  if(!finslerV4Equivalent(base,best))best=base;finslerComputeCache[original]=best;finslerComputeCache[best]=best;return best;
};

function finslerV4OneStrongStep(current,reference){
  var local=finslerV4LocalProductStep(current,reference);if(local!==current)return local;
  var candidate=finslerV4NerdamerCandidate(current,true);if(candidate)candidate=finslerV4FractionForm(candidate);
  var best=finslerV4Prefer(current,candidate,true);best=finslerV4FractionForm(best);if(!finslerV4Equivalent(reference,best))best=current;if(best!==current)return best;
  var len=finslerV4Length(current);
  if(len>45&&len<=380)try{var node=math.parse(current),recursive=finslerV4SimplifyNode(node,0).toString({parenthesis:"auto"});recursive=finslerV4FractionForm(recursive);if(finslerV4Equivalent(reference,recursive))best=finslerV4Prefer(current,recursive,true);}catch(e){}
  return best;
}
PS=function(expr){
  var original=raw(expr);if(finslerPresentCache[original]!==undefined)return finslerPresentCache[original];
  var base=S(original),best=base;if(base==="0"||base==="1"||finslerV4Length(base)<7){finslerPresentCache[original]=base;return base;}
  for(var round=0;round<5;round++){var next=finslerV4OneStrongStep(best,base);if(next===best)break;best=next;}
  if(!finslerV4Equivalent(base,best))best=base;finslerPresentCache[original]=best;finslerPresentCache[best]=best;return best;
};

onmessage=function(event){
  finslerV4SubtreeCache=Object.create(null);
  finslerV4BaseOnMessage(event);
};
