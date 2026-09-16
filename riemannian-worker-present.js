"use strict";

/* Consolidated final worker layer. The core tensor engine and exact rational
   canonicalizer live in riemannian-worker-fast.js; this file combines the
   former polish + presentation wrappers so there is only one presentation
   layer to load and maintain. */
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
function halfMonomialKey(key){
  var exps=parseMonomial(key),out=Object.create(null),id;
  for(id in exps){if(exps[id]%2!==0)return null;if(exps[id])out[id]=exps[id]/2;}
  return monomialKey(out);
}
function perfectSquareBinomialFactor(poly){
  var keys=Object.keys(poly);if(keys.length!==3)return null;
  for(var m=0;m<keys.length;m++){
    var middle=poly[keys[m]];
    if(middle.d!==1n||absBig(middle.n)!==2n)continue;
    var outer=keys.filter(function(_,i){return i!==m;}),qa=poly[outer[0]],qb=poly[outer[1]];
    if(qa.d!==1n||qb.d!==1n||absBig(qa.n)!==1n||qb.n!==qa.n)continue;
    var sa=halfMonomialKey(outer[0]),sb=halfMonomialKey(outer[1]);
    if(sa===null||sb===null||multiplyKeys(sa,sb)!==keys[m])continue;
    var relative=middle.n===2n*qa.n?1:(middle.n===-2n*qa.n?-1:0);if(!relative)continue;
    var factor=newPoly();addPolyTerm(factor,sa,Q(1));addPolyTerm(factor,sb,Q(relative));return factor;
  }
  return null;
}
function nonConstantFactor(poly){
  var residual=primitiveResidual(poly);if(!residual)return null;
  var keys=Object.keys(residual.poly);
  if(keys.length===2){if(keys.every(function(k){return k==="";}))return null;return residual.poly;}
  return perfectSquareBinomialFactor(residual.poly);
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

  var whole=polyDivExact(rf.n,rf.d,ctx);
  if(whole){rf.n=whole;rf.d=polyConst(Q(1));return rf;}

  for(var round=0;round<4;round++){
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

function singleLinearAtom(key){
  var exps=parseMonomial(key),ids=Object.keys(exps);
  if(ids.length!==1)return null;
  var id=Number(ids[0]);
  return exps[id]===1?id:null;
}
function preferredLinearBinomial(poly,ctx){
  var keys=Object.keys(poly);
  if(keys.length!==2)return null;
  var aId=singleLinearAtom(keys[0]),bId=singleLinearAtom(keys[1]);
  if(aId===null||bId===null)return null;
  var a=poly[keys[0]],b=poly[keys[1]];
  if(a.d!==1n||b.d!==1n||absBig(a.n)!==1n||absBig(b.n)!==1n||a.n===b.n)return null;
  var aCoord=/^x\d+$/.test(ctx.atoms[aId]),bCoord=/^x\d+$/.test(ctx.atoms[bId]);
  if(aCoord===bCoord)return null;
  var coordId=aCoord?aId:bId,paramId=aCoord?bId:aId;
  var coordQ=aCoord?a:b;
  return {sign:coordQ.n>0n?1:-1,text:atomFactor(ctx.atoms[coordId])+" - "+atomFactor(ctx.atoms[paramId])};
}
function presentationPolyData(poly,ctx){
  if(polyZero(poly))return {sign:1,content:Q(0),factors:["0"]};
  var info=primitiveResidual(poly),res=info.poly,sign=1,factors=[];
  var preferred=preferredLinearBinomial(res,ctx);
  if(preferred){sign=preferred.sign;}
  else{var lead=leadingKey(res);if(lead!==null&&res[lead]&&res[lead].n<0n){res=polyScale(res,Q(-1));sign=-1;}}
  var monomial=commonMonomialString(info.exps,ctx);if(monomial)factors.push(monomial);
  if(preferred){factors.push("("+preferred.text+")");}
  else{
    var residual=polyToString(res,ctx),residualKeys=Object.keys(res);
    if(residual==="-1")sign*=-1;
    else if(residual!=="1")factors.push(residualKeys.length>1?"("+residual+")":residual);
  }
  return {sign:sign,content:info.content,factors:factors};
}
function partsProduct(parts){return parts.length?parts.join("*"):"1";}
rfToString=function(rf,ctx){
  var n=presentationPolyData(rf.n,ctx),d=presentationPolyData(rf.d,ctx);
  if(n.content.n===0n)return "0";
  var coefficient=qDiv(n.content,d.content),numerator=n.factors.slice(),denominator=d.factors.slice();
  var coeffNumerator=absBig(coefficient.n),coeffDenominator=coefficient.d;
  if(coeffNumerator!==1n)numerator.unshift(String(coeffNumerator));
  if(coeffDenominator!==1n)denominator.unshift(String(coeffDenominator));
  var sign=n.sign*d.sign*(coefficient.n<0n?-1:1),num=partsProduct(numerator),den=partsProduct(denominator);
  if(sign<0)num="-"+num;
  if(den==="1")return num;
  return "("+num+")/("+den+")";
};

function presentationExpression(expr){
  var cleaned=S(trigCleanup(expr));
  try{
    var ctx={atomIds:Object.create(null),atoms:[],ops:0,maxOps:60000,maxTerms:5000};
    var rf=normalizeRF(rfFromNode(math.parse(cleaned),ctx),ctx);
    if(polyZero(rf.n))return "0";
    return rfToString(rf,ctx);
  }catch(e){return cleaned;}
}
var calculationChristoffelOutput=christoffelOutput;
christoffelOutput=function(G){
  return calculationChristoffelOutput(G).map(function(component){component.value=presentationExpression(component.value);return component;});
};
function presentationMatrix(matrix){return matrix.map(function(row){return row.map(presentationExpression);});}

var nativePostMessage=self.postMessage.bind(self);
self.postMessage=function(message,transfer){
  if(message&&message.type==="result"&&message.result){
    var result=message.result;
    if(result.inverse){var inverse=result.inverse;result.inverse={matrix:presentationMatrix(inverse.matrix),det:presentationExpression(inverse.det)};}
    if(result.ricci)result.ricci=presentationMatrix(result.ricci);
    if(result.scalar!==undefined)result.scalar=presentationExpression(result.scalar);
    if(result.einstein)result.einstein=presentationMatrix(result.einstein);
  }
  if(arguments.length>1)return nativePostMessage(message,transfer);
  return nativePostMessage(message);
};
