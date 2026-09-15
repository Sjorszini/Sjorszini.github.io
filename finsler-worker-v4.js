"use strict";

/*
 * Stable entry point for the calculator worker.
 *
 * v4-base contains symbolic-function support, diagonal inversion and the
 * original two-level simplifier. This entry point strengthens the actual
 * computational simplifier: reduced expressions are stored and reused by
 * Christoffel, spray, curvature and Ricci calculations.
 *
 * Important: after extracting a common factor we deliberately DO NOT feed the
 * factorised expression back through math.simplify(). math.js often expands
 * expressions such as rs*(rs-r) back to rs^2-r*rs, which is mathematically
 * equivalent but a worse canonical form for later tensor algebra and display.
 */
importScripts("finsler-worker-v4-base.js?v=1");

var finslerV6BaseS=S;
var finslerV6BaseOnMessage=onmessage;
var finslerV6ComputeCache=Object.create(null);
var finslerV6PresentCache=Object.create(null);

function finslerV6Score(text){return String(text).replace(/\s+/g,"").length;}

function finslerV6NeedsParens(text){
  var node;
  try{node=math.parse(String(text));}catch(e){return true;}
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return false;
  if(node.isSymbolNode||node.isConstantNode||node.isFunctionNode)return false;
  if(node.isOperatorNode&&node.op==="^"&&node.args.length===2)return false;
  if(node.isOperatorNode&&node.op==="-"&&node.args.length===1){
    var a=node.args[0];
    while(a&&a.isParenthesisNode)a=a.content;
    return !(a&&(a.isSymbolNode||a.isConstantNode||a.isFunctionNode||(a.isOperatorNode&&a.op==="^")));
  }
  return true;
}

function finslerV6FactorAtom(text){
  text=String(text).trim();
  return finslerV6NeedsParens(text)?"("+text+")":text;
}

/* Render the already-factorised representation without calling simplify on the
 * product afterwards. This is the key fix for expanded output such as
 * (rs^2-r*rs)/(2*r^4). */
function finslerV6ProductText(factors,removed){
  var parts=[];
  factors.order.forEach(function(key){
    var have=factors.map[key]?factors.map[key].power:0;
    var take=removed&&removed[key]?removed[key]:0;
    var p=have-take;
    if(p<=0)return;
    var atom=finslerV6FactorAtom(factors.map[key].text);
    parts.push(p===1?atom:atom+"^"+p);
  });
  return parts.length?parts.join("*"):"1";
}

/* Reduce one rational pair. Inputs are simplified before factoring, but the
 * reconstructed factorised numerator/denominator are preserved verbatim. */
function finslerV6ReducePair(num,den){
  num=finslerSimplifyText(num);
  den=finslerSimplifyText(den);
  if(num==="0")return {num:"0",den:"1"};

  var numNode,denNode;
  try{numNode=math.parse(num);denNode=math.parse(den);}catch(e){return {num:num,den:den};}
  var nf=finslerFactorExpression(numNode),df=finslerFactorExpression(denNode);
  var cancel=Object.create(null);
  nf.order.forEach(function(key){
    if(!df.map[key])return;
    var p=Math.min(nf.map[key].power,df.map[key].power);
    if(p>0)cancel[key]=p;
  });

  var n=finslerV6ProductText(nf,cancel);
  var d=finslerV6ProductText(df,cancel);
  if(nf.sign*df.sign<0)n=n==="1"?"-1":"-("+n+")";

  if(n==="0")return {num:"0",den:"1"};
  if(d==="1")return {num:n,den:"1"};
  if(d==="-1")return {num:n.charAt(0)==="-"?n.slice(1):"-("+n+")",den:"1"};
  return {num:n,den:d};
}

/* Build a reduced rational expression recursively. Reduction at every node is
 * what ensures that cancelled/factored forms are the expressions seen by later
 * derivatives and contractions, not merely by the renderer. */
function finslerV6RationalPair(node){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return {num:"0",den:"1"};
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){
      var u=finslerV6RationalPair(node.args[0]);
      return finslerV6ReducePair("-("+u.num+")",u.den);
    }
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerV6RationalPair(node.args[0]),b=finslerV6RationalPair(node.args[1]);
      return finslerV6ReducePair(
        "("+a.num+")*("+b.den+")"+node.op+"("+b.num+")*("+a.den+")",
        "("+a.den+")*("+b.den+")"
      );
    }
    if(node.op==="*"&&node.args.length===2){
      var m1=finslerV6RationalPair(node.args[0]),m2=finslerV6RationalPair(node.args[1]);
      return finslerV6ReducePair("("+m1.num+")*("+m2.num+")","("+m1.den+")*("+m2.den+")");
    }
    if(node.op==="/"&&node.args.length===2){
      var d1=finslerV6RationalPair(node.args[0]),d2=finslerV6RationalPair(node.args[1]);
      return finslerV6ReducePair("("+d1.num+")*("+d2.den+")","("+d1.den+")*("+d2.num+")");
    }
    if(node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var p=Number(node.args[1].value);
      if(Number.isInteger(p)){
        var base=finslerV6RationalPair(node.args[0]),q=Math.abs(p);
        if(p>=0)return finslerV6ReducePair("("+base.num+")^("+q+")","("+base.den+")^("+q+")");
        return finslerV6ReducePair("("+base.den+")^("+q+")","("+base.num+")^("+q+")");
      }
    }
  }
  return {num:finslerCanonicalNodeText(node),den:"1"};
}

function finslerV6RationalCanonical(expr){
  var text=String(expr),node;
  try{node=math.parse(text);}catch(e){return text;}
  var pair=finslerV6RationalPair(node);
  return pair.den==="1"?pair.num:"("+pair.num+")/("+pair.den+")";
}

/* Prefer a shorter canonical form. For ties, prefer the factorised form when
 * the original contains an expanded additive polynomial; this makes
 * rs^2-r*rs consistently become rs*(rs-r) instead of oscillating between the
 * two equivalent representations. */
function finslerV6Choose(base,canonical){
  if(!canonical)return base;
  var a=finslerV6Score(base),b=finslerV6Score(canonical);
  if(b<a)return canonical;
  if(b===a&&/[+-]/.test(base)&&canonical.indexOf("*(")!==-1)return canonical;
  return base;
}

/* COMPUTATIONAL simplifier. Its return value is stored in g^{-1}, Gamma, G,
 * curvature, Ricci, etc. and therefore feeds every subsequent calculation. */
S=function(expr){
  var original=raw(expr);
  if(finslerV6ComputeCache[original]!==undefined)return finslerV6ComputeCache[original];
  var best=finslerV6BaseS(original);
  if(finslerV6Score(best)<=1600&&(best.indexOf("/")!==-1||/[+-]/.test(best))){
    best=finslerV6Choose(best,finslerV6RationalCanonical(best));
  }
  finslerV6ComputeCache[original]=best;
  finslerV6ComputeCache[best]=best;
  return best;
};

/* Final output only performs the same factor-preserving canonicalisation once.
 * It does not invoke the older presentation routine that re-expanded factors. */
PS=function(expr){
  var original=raw(expr);
  if(finslerV6PresentCache[original]!==undefined)return finslerV6PresentCache[original];
  var best=S(original);
  if(finslerV6Score(best)<=6000)best=finslerV6Choose(best,finslerV6RationalCanonical(best));
  finslerV6PresentCache[original]=best;
  finslerV6PresentCache[best]=best;
  return best;
};

onmessage=function(event){
  if(event&&event.data&&event.data.type==="calculate"){
    finslerV6ComputeCache=Object.create(null);
    finslerV6PresentCache=Object.create(null);
  }
  finslerV6BaseOnMessage(event);
};