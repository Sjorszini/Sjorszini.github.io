"use strict";

/*
 * Stable entry point for the calculator worker.
 *
 * v4-base contains the symbolic-function, diagonal-inverse and two-level
 * simplification machinery from the previous revision.  This entry point adds
 * recursive reduced-rational canonicalization.  The important distinction is
 * that S(expr) below is the COMPUTATIONAL simplifier: its result is stored and
 * reused by Christoffel, spray, curvature and Ricci calculations.  PS(expr)
 * only adds a stronger final presentation pass.
 */
importScripts("finsler-worker-v4-base.js?v=1");

var finslerV5BaseS=S;
var finslerV5BasePS=PS;
var finslerV5BaseOnMessage=onmessage;
var finslerV5ComputeCache=Object.create(null);
var finslerV5PresentCache=Object.create(null);

function finslerV5Score(text){return String(text).replace(/\s+/g,"").length;}

/* Cancel factors in one numerator/denominator pair.  Unlike the older final
 * pass this runs while the rational tree is being built, so a quotient such as
 * ((r-rs)*rs)/(r-rs) becomes rs BEFORE it is added to neighbouring terms. */
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

/* Convert an expression to a reduced rational pair recursively.  Reducing at
 * every node prevents large common-denominator numerators from ever entering
 * later tensor calculations.  Non-rational atoms (sin, custom function tokens,
 * etc.) are simply treated as algebraic atoms and are therefore safe. */
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

/* Computational simplification.  This is deliberately cached and is the S()
 * used by all subsequent calculations.  Rational canonicalization is bounded
 * by expression size to avoid making genuinely huge Finsler expressions more
 * expensive merely for prettiness. */
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

/* Presentation adds the older strong pass and then one more reduced-rational
 * pass.  It never feeds a different expression back into the calculation;
 * calculation already uses the simplified S() value above. */
PS=function(expr){
  var original=raw(expr);
  if(finslerV5PresentCache[original]!==undefined)return finslerV5PresentCache[original];
  var best=S(original);
  var strong=finslerV5BasePS(best);
  if(finslerV5Score(strong)<finslerV5Score(best))best=strong;
  if(finslerV5Score(best)<=5000){
    var canonical=finslerV5RationalCanonical(best);
    if(finslerV5Score(canonical)<=finslerV5Score(best))best=canonical;
  }
  finslerV5PresentCache[original]=best;
  finslerV5PresentCache[best]=best;
  return best;
};

/* The imported v4 onmessage already resets its own derivative/compute caches.
 * Reset the new canonicalization caches at the same run boundary. */
onmessage=function(event){
  if(event&&event.data&&event.data.type==="calculate"){
    finslerV5ComputeCache=Object.create(null);
    finslerV5PresentCache=Object.create(null);
  }
  finslerV5BaseOnMessage(event);
};
