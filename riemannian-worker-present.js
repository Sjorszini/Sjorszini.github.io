"use strict";

/* Keep calculation expressions optimized for the curvature pipeline, but
   serialize final display values from the exact rational form directly so
   presentation does not re-expand factored denominators. */
importScripts("riemannian-worker-polish.js?v=1");

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
  return {
    sign:coordQ.n>0n?1:-1,
    text:atomFactor(ctx.atoms[coordId])+" - "+atomFactor(ctx.atoms[paramId])
  };
}

function presentationPolyData(poly,ctx){
  if(polyZero(poly))return {sign:1,content:Q(0),factors:["0"]};
  var info=primitiveResidual(poly),res=info.poly,sign=1,factors=[];
  var preferred=preferredLinearBinomial(res,ctx);
  if(preferred){
    sign=preferred.sign;
  }else{
    var lead=leadingKey(res);
    if(lead!==null&&res[lead]&&res[lead].n<0n){res=polyScale(res,Q(-1));sign=-1;}
  }

  var monomial=commonMonomialString(info.exps,ctx);
  if(monomial)factors.push(monomial);

  if(preferred){
    factors.push("("+preferred.text+")");
  }else{
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

  var sign=n.sign*d.sign*(coefficient.n<0n?-1:1);
  var num=partsProduct(numerator),den=partsProduct(denominator);
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
  }catch(e){
    return cleaned;
  }
}

var calculationChristoffelOutput=christoffelOutput;
christoffelOutput=function(G){
  return calculationChristoffelOutput(G).map(function(component){
    component.value=presentationExpression(component.value);
    return component;
  });
};

function presentationMatrix(matrix){
  return matrix.map(function(row){return row.map(presentationExpression);});
}

/* Internal tensor expressions stay in the calculation-optimized form. Only
   the finished result object is canonicalized for display/copying. */
var nativePostMessage=self.postMessage.bind(self);
self.postMessage=function(message,transfer){
  if(message&&message.type==="result"&&message.result){
    var result=message.result;
    if(result.inverse){
      var inverse=result.inverse;
      result.inverse={matrix:presentationMatrix(inverse.matrix),det:presentationExpression(inverse.det)};
    }
    if(result.ricci)result.ricci=presentationMatrix(result.ricci);
    if(result.scalar!==undefined)result.scalar=presentationExpression(result.scalar);
    if(result.einstein)result.einstein=presentationMatrix(result.einstein);
  }
  if(arguments.length>1)return nativePostMessage(message,transfer);
  return nativePostMessage(message);
};
