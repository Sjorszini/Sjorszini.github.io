"use strict";

/* Keep calculation expressions optimized for the curvature pipeline, but
   serialize connection coefficients from the exact rational form directly so
   presentation does not re-expand factored denominators. */
importScripts("riemannian-worker-polish.js?v=1");

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
