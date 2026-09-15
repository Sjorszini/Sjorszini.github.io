"use strict";

/*
 * Stable entry point for the calculator worker.
 *
 * v4-base contains symbolic-function support, diagonal inversion and the
 * original two-level simplifier.  This entry point strengthens the actual
 * computational simplifier: reduced expressions are stored and reused by
 * Christoffel, spray, curvature and Ricci calculations.  Final rendering only
 * performs one cheap cached canonicalization pass.
 */
importScripts("finsler-worker-v4-base.js?v=1");

var finslerV5BaseS=S;
var finslerV5BaseOnMessage=onmessage;
var finslerV5ComputeCache=Object.create(null);
var finslerV5PresentCache=Object.create(null);

function finslerV5Score(text){return String(text).replace(/\s+/g,"").length;}

/* Cancel factors in one numerator/denominator pair.  This happens while the
 * rational expression is being built, not only at display time. */
function finslerV5ReducePair(num,den){
  num=finslerSimplifyText(num);
  den=finslerSimplifyText(den);
  if(num==="0")return {num:"0",den:"1"};
  if(den==="1")return {num:num,den:"1"};

  var numNode,denNode;
  try{numNode=math.parse(num);denNode=math.parse(den);}catch(e){return {num:num,den:den};}
  var nf=finslerFactorExpression(numNode),df=finslerFactorExpression(denNode);
  var cancel=Object.create(null);
  nf.order.forEach(function(key){
    if(!df.map[key])return;
    var p=Math.min(nf.map[key].power,df.map[key].power);
    if(p>0)cancel[key]=p;
  });
  var n=finslerProductText(nf,cancel),d=finslerProductText(df,cancel);
  if(nf.sign*df.sign<0)n="-("+n+")";
  n=finslerSimplifyText(n);
  d=finslerSimplifyText(d);
  if(n==="0")return {num:"0",den:"1"};
  if(d==="-1")return {num:finslerSimplifyText("-("+n+")"),den:"1"};
  return {num:n,den:d};
}

/* Build a reduced rational pair recursively.  Non-rational functions such as
 * sin(x) and custom symbolic functions remain exact algebraic atoms. */
function finslerV5RationalPair(node){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return {num:"0",den:"1"};
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){
      var u=finslerV5RationalPair(node.args[0]);
      return finslerV5ReducePair("-("+u.num+")",u.den);
    }
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerV5RationalPair(node.args[0]),b=finslerV5RationalPair(node.args[1]);
      return finslerV5ReducePair(
        "("+a.num+")*("+b.den+")"+node.op+"("+b.num+")*("+a.den+")",
        "("+a.den+")*("+b.den+")"
      );
    }
    if(node.op==="*"&&node.args.length===2){
      var m1=finslerV5RationalPair(node.args[0]),m2=finslerV5RationalPair(node.args[1]);
      return finslerV5ReducePair("("+m1.num+")*("+m2.num+")","("+m1.den+")*("+m2.den+")");
    }
    if(node.op==="/"&&node.args.length===2){
      var d1=finslerV5RationalPair(node.args[0]),d2=finslerV5RationalPair(node.args[1]);
      return finslerV5ReducePair("("+d1.num+")*("+d2.den+")","("+d1.den+")*("+d2.num+")");
    }
    if(node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var p=Number(node.args[1].value);
      if(Number.isInteger(p)){
        var base=finslerV5RationalPair(node.args[0]),q=Math.abs(p);
        if(p>=0)return finslerV5ReducePair("("+base.num+")^("+q+")","("+base.den+")^("+q+")");
        return finslerV5ReducePair("("+base.den+")^("+q+")","("+base.num+")^("+q+")");
      }
    }
  }
  return {num:finslerCanonicalNodeText(node),den:"1"};
}

function finslerV5RationalCanonical(expr){
  var text=String(expr),node;
  try{node=math.parse(text);}catch(e){return text;}
  var pair=finslerV5RationalPair(node);
  var candidate=pair.den==="1"?pair.num:"("+pair.num+")/("+pair.den+")";
  return finslerSimplifyText(candidate);
}

/* Computational simplification.  This S() is what later derivatives and
 * tensor contractions actually receive. */
S=function(expr){
  var original=raw(expr);
  if(finslerV5ComputeCache[original]!==undefined)return finslerV5ComputeCache[original];
  var best=finslerV5BaseS(original);
  if(finslerV5Score(best)<=1200&&(best.indexOf("/")!==-1||/[+-]/.test(best))){
    var canonical=finslerV5RationalCanonical(best);
    if(finslerV5Score(canonical)<=finslerV5Score(best))best=canonical;
  }
  finslerV5ComputeCache[original]=best;
  finslerV5ComputeCache[best]=best;
  return best;
};

/* Final output is intentionally light.  Do not run the old multi-pass
 * presentation simplifier again: that duplicated work and was included in the
 * per-component timing shown in the UI. */
PS=function(expr){
  var original=raw(expr);
  if(finslerV5PresentCache[original]!==undefined)return finslerV5PresentCache[original];
  var best=S(original);
  if(finslerV5Score(best)<=5000){
    var canonical=finslerV5RationalCanonical(best);
    if(finslerV5Score(canonical)<=finslerV5Score(best))best=canonical;
  }
  finslerV5PresentCache[original]=best;
  finslerV5PresentCache[best]=best;
  return best;
};

onmessage=function(event){
  if(event&&event.data&&event.data.type==="calculate"){
    finslerV5ComputeCache=Object.create(null);
    finslerV5PresentCache=Object.create(null);
  }
  finslerV5BaseOnMessage(event);
};
