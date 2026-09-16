"use strict";

/* Presentation-oriented exact factor cancellation layered on top of the
   tested rational curvature worker.  It performs only bounded polynomial
   division/factoring; tensor construction and differentiation remain in the
   base worker. */
importScripts("riemannian-worker-fast.js?v=4");

function copyPoly(poly){
  var out=newPoly(),key;for(key in poly)out[key]=cloneQ(poly[key]);return out;
}
function monomialDegree(key){
  var exps=parseMonomial(key),sum=0,id;for(id in exps)sum+=exps[id];return sum;
}
function compareMonomialKeys(a,b){
  var da=monomialDegree(a),db=monomialDegree(b);if(da!==db)return da-db;
  var ea=parseMonomial(a),eb=parseMonomial(b),ids=Object.create(null),id;
  for(id in ea)ids[id]=1;for(id in eb)ids[id]=1;
  var ordered=Object.keys(ids).map(Number).sort(function(x,y){return x-y;});
  for(var i=0;i<ordered.length;i++){
    id=ordered[i];var diff=(ea[id]||0)-(eb[id]||0);if(diff)return diff;
  }
  return 0;
}
function leadingKey(poly){
  var keys=Object.keys(poly);if(!keys.length)return null;
  var best=keys[0];for(var i=1;i<keys.length;i++)if(compareMonomialKeys(keys[i],best)>0)best=keys[i];return best;
}
function divideMonomialKeys(dividend,divisor){
  var a=parseMonomial(dividend),b=parseMonomial(divisor),out=Object.create(null),id;
  for(id in b)if((a[id]||0)<b[id])return null;
  for(id in a){var e=a[id]-(b[id]||0);if(e)out[id]=e;}
  return monomialKey(out);
}
function polyDivExact(dividend,divisor,ctx){
  if(polyZero(divisor))return null;
  var remainder=copyPoly(dividend),quotient=newPoly(),leadD=leadingKey(divisor),steps=0;
  while(!polyZero(remainder)){
    if(++steps>256)return null;
    var leadR=leadingKey(remainder),qKey=divideMonomialKeys(leadR,leadD);if(qKey===null)return null;
    var qCoeff=qDiv(remainder[leadR],divisor[leadD]);addPolyTerm(quotient,qKey,qCoeff);
    for(var dk in divisor){
      ctx.ops++;addPolyTerm(remainder,multiplyKeys(qKey,dk),qNeg(qMul(qCoeff,divisor[dk])));
    }
    checkBudget(remainder,ctx);checkBudget(quotient,ctx);
  }
  return quotient;
}
function lcmBig(a,b){a=absBig(a);b=absBig(b);if(a===0n||b===0n)return 0n;return a/gcdBig(a,b)*b;}
function coefficientContent(poly){
  var keys=Object.keys(poly);if(!keys.length)return Q(1);
  var gn=0n,ld=1n;
  keys.forEach(function(key){var q=poly[key];gn=gn===0n?absBig(q.n):gcdBig(gn,q.n);ld=lcmBig(ld,q.d);});
  return Q(gn||1n,ld||1n);
}
function primitiveResidual(poly){
  if(polyZero(poly))return null;
  var exps=commonExps(poly),content=coefficientContent(poly),res=subtractExps(poly,exps);
  res=polyScale(res,qDiv(Q(1),content));
  return {poly:res,exps:exps,content:content};
}
function nonConstantFactor(poly){
  var residual=primitiveResidual(poly);if(!residual)return null;
  var keys=Object.keys(residual.poly);
  if(keys.length!==2)return null;
  if(keys.every(function(k){return k==="";}))return null;
  return residual.poly;
}
function cancelFactor(rf,factor,ctx){
  if(!factor)return false;
  var qn=polyDivExact(rf.n,factor,ctx);if(!qn)return false;
  var qd=polyDivExact(rf.d,factor,ctx);if(!qd)return false;
  rf.n=qn;rf.d=qd;return true;
}

var baseNormalizeRF=normalizeRF;
normalizeRF=function(rf,ctx){
  rf=baseNormalizeRF(rf,ctx);
  if(polyZero(rf.n))return rf;

  /* If the whole denominator divides the numerator, collapse immediately.
     This turns Schwarzschild det(g), for example, into -r^4 sin(theta)^2. */
  var whole=polyDivExact(rf.n,rf.d,ctx);
  if(whole){rf.n=whole;rf.d=polyConst(Q(1));return rf;}

  /* Cancel small non-monomial factors exposed after the base monomial pass.
     A few bounded rounds cover expressions such as (r-r_s)^2 without a
     general-purpose polynomial GCD algorithm. */
  for(var round=0;round<3;round++){
    var changed=false;
    changed=cancelFactor(rf,nonConstantFactor(rf.n),ctx)||changed;
    if(!changed)changed=cancelFactor(rf,nonConstantFactor(rf.d),ctx)||changed;
    if(!changed)break;
    rf=baseNormalizeRF(rf,ctx);
    if(polyZero(rf.n))return rf;
    whole=polyDivExact(rf.n,rf.d,ctx);
    if(whole){rf.n=whole;rf.d=polyConst(Q(1));return rf;}
  }
  return rf;
};

function commonMonomialString(exps,ctx){
  var ids=Object.keys(exps).map(Number).sort(function(a,b){return a-b;}),parts=[];
  ids.forEach(function(id){var atom=atomFactor(ctx.atoms[id]),e=exps[id];parts.push(e===1?atom:"("+atom+")^"+e);});
  return parts.join("*");
}
function factoredPolyString(poly,ctx){
  if(polyZero(poly))return "0";
  var info=primitiveResidual(poly),res=info.poly,lead=leadingKey(res),sign=1;
  if(lead!==null&&res[lead]&&res[lead].n<0n){res=polyScale(res,Q(-1));sign=-1;}
  var parts=[],content=info.content;
  if(!qOne(content))parts.push(absQString(content));
  var monomial=commonMonomialString(info.exps,ctx);if(monomial)parts.push(monomial);
  var residual=polyToString(res,ctx),residualKeys=Object.keys(res);
  if(residual!=="1"){
    if(residual==="-1"){sign*=-1;}
    else parts.push(residualKeys.length>1?"("+residual+")":residual);
  }
  if(!parts.length)parts.push("1");
  return (sign<0?"-":"")+parts.join("*");
}
rfToString=function(rf,ctx){
  var numerator=factoredPolyString(rf.n,ctx),denominator=factoredPolyString(rf.d,ctx);
  if(denominator==="1")return numerator;
  if(denominator==="-1")return "-("+numerator+")";
  return "("+numerator+")/("+denominator+")";
};
