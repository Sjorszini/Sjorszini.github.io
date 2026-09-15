"use strict";

/* Final polish over the fast, regression-tested worker. */
importScripts("finsler-worker-v4-fast.js?v=1");

var finslerV6StrongPS=finslerStrongPS;

/* A few curvature expressions become short only after factoring a small
 * polynomial denominator, e.g. r^2-2*r*rs+rs^2=(r-rs)^2.  Give bounded final
 * expressions one extra factor/simplify attempt, then keep it only when the
 * verified numerical-equivalence guard accepts it. */
finslerStrongPS=function(expr){
  var original=raw(expr),best=finslerV6StrongPS(original);
  if(finslerCompactLength(best)>18&&finslerCompactLength(best)<=220&&finslerOpCount(best)<=32){
    var candidate=finslerNerdamerCandidate(best,true);
    if(candidate){
      candidate=finslerFractionForm(candidate);
      best=finslerPrefer(best,candidate,true);
    }
    if(typeof nerdamer==="function"){
      try{
        var factored=nerdamer("factor("+best+")").toString();
        if(factored){factored=finslerFractionForm(factored);best=finslerPrefer(best,factored,true);}
      }catch(e){}
    }
  }
  return finslerEquivalentNumerically(original,best)?best:finslerV6StrongPS(original);
};
