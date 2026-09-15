"use strict";

/*
 * Finsler worker v4 — verified geometry with guarded canonical simplification.
 *
 * The geometry engine and custom-function differentiation live in
 * finsler-worker-v4-base.js.  This layer deliberately replaces its historical
 * heuristic simplifier with a conservative CAS pass:
 *   - S(expr) is the computational canonicalizer, so accepted simplifications
 *     are stored and reused by every later tensor calculation.
 *   - PS(expr) is the stronger final-output canonicalizer used by the base
 *     worker's postMessage gateway for every component and summary tensor.
 *
 * Every Nerdamer rewrite is numerically checked against the math.js expression
 * at several generic points before it is accepted.  This keeps the verified
 * v3 tensor formulas authoritative while still factoring/cancelling rational
 * expressions that math.simplify() leaves expanded.
 */
importScripts("finsler-worker-v4-base.js?v=2");
try{importScripts("https://cdn.jsdelivr.net/npm/nerdamer-prime@1.5.0/all.min.js");}catch(e){}

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
      var arg=child.args[i];
      while(arg&&arg.isParenthesisNode)arg=arg.content;
      if(arg&&arg.isOperatorNode&&(arg.op==="+"||(arg.op==="-"&&arg.args.length===2))){count++;break;}
    }
  });
  return count;
}

function finslerV4Symbols(text){
  var out=[],seen=Object.create(null),node;
  try{node=math.parse(String(text));}catch(e){return out;}
  node.traverse(function(child){
    if(!child||!child.isSymbolNode)return;
    var name=child.name;
    if(FINSLER_V4_STANDARD[name]||seen[name])return;
    seen[name]=1;out.push(name);
  });
  return out.sort();
}
function finslerV4Scope(names,k){
  var scope={};
  names.forEach(function(name,index){
    var value=1.13+0.17*index+0.11*k;
    var m=/^x(\d+)$/.exec(name);
    if(m){
      var n=Number(m[1]);
      value=n===1?0.37+0.09*k:n===2?7.0+1.7*k:n===3?0.71+0.13*k:0.53+0.08*k+0.17*n;
    }else if(/^y\d+$/.test(name))value=0.79+0.19*index+0.07*k;
    else if(name==="rs")value=2.0+0.23*k;
    else if(name==="M")value=1.0+0.13*k;
    else if(/^__uf/.test(name))value=1.31+0.14*index+0.06*k;
    scope[name]=value;
  });
  return scope;
}
function finslerV4Magnitude(value){try{return Number(math.abs(value));}catch(e){return NaN;}}
function finslerV4Equivalent(a,b){
  if(String(a)===String(b))return true;
  var names=finslerV4Symbols("("+a+")+("+b+")"),success=0;
  for(var k=0;k<6;k++){
    var av,bv,delta,scale,scope=finslerV4Scope(names,k);
    try{
      av=math.evaluate(String(a),scope);
      bv=math.evaluate(String(b),scope);
      delta=finslerV4Magnitude(math.subtract(av,bv));
      scale=Math.max(1,finslerV4Magnitude(av),finslerV4Magnitude(bv));
    }catch(e){continue;}
    if(!Number.isFinite(delta)||!Number.isFinite(scale))continue;
    success++;
    if(delta>2e-9*scale)return false;
  }
  return success>=4;
}

function finslerV4Prefer(base,candidate,allowStructure){
  if(!candidate)return base;
  candidate=String(candidate);
  if(!finslerV4Equivalent(base,candidate))return base;
  var a=finslerV4Length(base),b=finslerV4Length(candidate);
  if(b<a)return candidate;
  if(allowStructure&&b<=a+12&&finslerV4FactoredAdds(candidate)>finslerV4FactoredAdds(base))return candidate;
  if(allowStructure&&b<=a+8&&finslerV4Adds(candidate)<finslerV4Adds(base))return candidate;
  return base;
}

function finslerV4NerdamerCandidates(text,maxLength,maxOps){
  var out=[];
  if(typeof nerdamer!=="function")return out;
  text=String(text);
  if(finslerV4Length(text)>maxLength||finslerV4Ops(text)>maxOps)return out;
  var simplified=null;
  try{simplified=nerdamer("simplify("+text+")").toString();if(simplified)out.push(simplified);}catch(e){}
  try{var factored=nerdamer("factor("+text+")").toString();if(factored)out.push(factored);}catch(e2){}
  if(simplified){
    try{var sf=nerdamer("factor("+simplified+")").toString();if(sf)out.push(sf);}catch(e3){}
  }
  return out;
}
function finslerV4MathCandidates(text){
  var out=[];
  try{out.push(math.simplify(String(text)).toString({parenthesis:"auto"}));}catch(e){}
  if(typeof math.rationalize==="function"&&finslerV4Length(text)<=260){
    try{out.push(math.rationalize(String(text)).toString({parenthesis:"auto"}));}catch(e2){}
  }
  return out;
}
function finslerV4Choose(base,candidates,allowStructure){
  var best=String(base);
  for(var i=0;i<candidates.length;i++)best=finslerV4Prefer(best,candidates[i],allowStructure);
  return best;
}
function finslerV4NeedsComputeCAS(text){
  var s=String(text);
  if(finslerV4Length(s)<7||finslerV4Length(s)>170||finslerV4Ops(s)>22)return false;
  if(s==="0"||s==="1"||s==="-1")return false;
  /* Factoring/cancellation is only useful when an additive expression is mixed
     with products, powers, or quotients. This gate keeps the downstream CAS
     pass cheap enough for interactive use. */
  return /[+\-]/.test(s.replace(/^[-+]/,""))&&/[*/^]/.test(s);
}

/* Computational canonicalizer. Accepted forms are what the geometry engine
 * stores in g^{-1}, Gamma, G, N, curvature, Ricci, etc., so later operations
 * differentiate/contract the compact expression rather than an expanded one. */
S=function(expr){
  var original=raw(expr);
  if(finslerComputeCache[original]!==undefined)return finslerComputeCache[original];
  var base=finslerBaseS(original),best=base;
  if(finslerV4NeedsComputeCAS(base)){
    best=finslerV4Choose(best,finslerV4MathCandidates(best),true);
    best=finslerV4Choose(best,finslerV4NerdamerCandidates(best,170,22),true);
  }
  if(!finslerV4Equivalent(base,best))best=base;
  finslerComputeCache[original]=best;
  finslerComputeCache[best]=best;
  return best;
};

/* Final canonicalizer. finsler-worker-v4-base.js routes every emitted component
 * and every summary value through PS(), regardless of tensor section. */
PS=function(expr){
  var original=raw(expr);
  if(finslerPresentCache[original]!==undefined)return finslerPresentCache[original];
  var reference=S(original),best=reference;
  if(reference!=="0"&&reference!=="1"&&finslerV4Length(reference)>=7){
    for(var round=0;round<3;round++){
      var before=best;
      best=finslerV4Choose(best,finslerV4MathCandidates(best),true);
      best=finslerV4Choose(best,finslerV4NerdamerCandidates(best,520,70),true);
      if(best===before)break;
    }
  }
  if(!finslerV4Equivalent(reference,best))best=reference;
  finslerPresentCache[original]=best;
  finslerPresentCache[best]=best;
  return best;
};
