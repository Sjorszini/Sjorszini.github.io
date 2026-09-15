"use strict";

/*
 * Stable entry point for the calculator worker.
 *
 * v4-base contains symbolic-function support, diagonal inversion and the
 * original two-level simplifier. This entry point strengthens the actual
 * computational simplifier: reduced expressions are stored and reused by
 * Christoffel, spray, curvature and Ricci calculations.
 *
 * Common factors are preserved in factored form instead of being sent through
 * math.simplify() again (which tends to re-expand them). Hidden polynomial
 * factors are additionally cancelled by exact low-degree polynomial division.
 */
importScripts("finsler-worker-v4-base.js?v=1");

var finslerV7BaseS=S;
var finslerV7BaseOnMessage=onmessage;
var finslerV7ComputeCache=Object.create(null);
var finslerV7PresentCache=Object.create(null);

function finslerV7Score(text){return String(text).replace(/\s+/g,"").length;}
function finslerV7IsZero(text){return finslerSimplifyText(text).replace(/\s+/g,"")==="0";}

function finslerV7NeedsParens(text){
  var node;
  try{node=math.parse(String(text));}catch(e){return true;}
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return false;
  if(node.isSymbolNode||node.isConstantNode||node.isFunctionNode)return false;
  if(node.isOperatorNode&&node.op==="^"&&node.args.length===2)return false;
  if(node.isOperatorNode&&node.op==="-"&&node.args.length===1){
    var a=node.args[0];while(a&&a.isParenthesisNode)a=a.content;
    return !(a&&(a.isSymbolNode||a.isConstantNode||a.isFunctionNode||(a.isOperatorNode&&a.op==="^")));
  }
  return true;
}
function finslerV7FactorAtom(text){text=String(text).trim();return finslerV7NeedsParens(text)?"("+text+")":text;}
function finslerV7ProductText(factors,removed){
  var parts=[];
  factors.order.forEach(function(key){
    var have=factors.map[key]?factors.map[key].power:0;
    var take=removed&&removed[key]?removed[key]:0;
    var p=have-take;if(p<=0)return;
    var atom=finslerV7FactorAtom(factors.map[key].text);
    parts.push(p===1?atom:atom+"^"+p);
  });
  return parts.length?parts.join("*"):"1";
}
function finslerV7FactorCanonical(text){
  var simplified=finslerSimplifyText(text),node,f;
  try{node=math.parse(simplified);f=finslerFactorExpression(node);}catch(e){return simplified;}
  if(!f||!f.order||!f.order.length)return simplified;
  if(f.order.length===1&&f.map[f.order[0]].power===1&&f.sign===1){
    var lone=String(f.map[f.order[0]].text);
    if(lone.replace(/\s+/g,"")===simplified.replace(/\s+/g,""))return simplified;
  }
  var out=finslerV7ProductText(f,null);
  if(f.sign<0)out="-"+out;
  return out;
}

function finslerV7HasFactorableSum(text){
  var node,found=false;
  try{node=math.parse(String(text));}catch(e){return false;}
  node.traverse(function(child){
    if(found||!child||!child.isOperatorNode)return;
    if(child.op!=="+"&&!(child.op==="-"&&child.args.length===2))return;
    try{var f=finslerFactorExpression(child);if(f&&f.order&&f.order.length>1)found=true;}catch(e2){}
  });
  return found;
}

/* ---------- exact polynomial division for hidden factors ---------- */
function finslerV7ContainsSymbol(node,name){
  var found=false;
  node.traverse(function(child){if(child&&child.isSymbolNode&&child.name===name)found=true;});
  return found;
}
function finslerV7PolyNorm(p){
  var out=Object.create(null);
  Object.keys(p).forEach(function(k){var c=finslerSimplifyText(p[k]);if(!finslerV7IsZero(c))out[Number(k)]=c;});
  return out;
}
function finslerV7PolyDegree(p){
  var keys=Object.keys(p).map(Number).filter(function(k){return !finslerV7IsZero(p[k]);});
  return keys.length?Math.max.apply(Math,keys):-1;
}
function finslerV7PolyAdd(a,b,sign){
  var out=Object.create(null);sign=sign===-1?-1:1;
  Object.keys(a).forEach(function(k){out[k]=a[k];});
  Object.keys(b).forEach(function(k){
    var term=sign<0?"-("+b[k]+")":b[k];
    out[k]=out[k]===undefined?term:"("+out[k]+")+("+term+")";
  });
  return finslerV7PolyNorm(out);
}
function finslerV7PolyMul(a,b,maxDegree){
  var out=Object.create(null);
  Object.keys(a).forEach(function(ka){Object.keys(b).forEach(function(kb){
    var d=Number(ka)+Number(kb);if(d>maxDegree)return;
    var term="("+a[ka]+")*("+b[kb]+")";
    out[d]=out[d]===undefined?term:"("+out[d]+")+("+term+")";
  });});
  return finslerV7PolyNorm(out);
}
function finslerV7PolyPow(a,p,maxDegree){
  var out={0:"1"},base=a;
  for(var i=0;i<p;i++){out=finslerV7PolyMul(out,base,maxDegree);if(finslerV7PolyDegree(out)>maxDegree)return null;}
  return out;
}
function finslerV7PolyFromNode(node,name,maxDegree){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return {0:"0"};
  if(node.isSymbolNode){var s={};s[node.name===name?1:0]=node.name;return s;}
  if(node.isConstantNode){return {0:node.toString({parenthesis:"auto"})};}
  if(node.isFunctionNode){
    if(finslerV7ContainsSymbol(node,name))return null;
    return {0:node.toString({parenthesis:"auto"})};
  }
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){
      var u=finslerV7PolyFromNode(node.args[0],name,maxDegree);if(!u)return null;
      var neg=Object.create(null);Object.keys(u).forEach(function(k){neg[k]="-("+u[k]+")";});return finslerV7PolyNorm(neg);
    }
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerV7PolyFromNode(node.args[0],name,maxDegree),b=finslerV7PolyFromNode(node.args[1],name,maxDegree);
      if(!a||!b)return null;return finslerV7PolyAdd(a,b,node.op==="-"?-1:1);
    }
    if(node.op==="*"&&node.args.length===2){
      var m1=finslerV7PolyFromNode(node.args[0],name,maxDegree),m2=finslerV7PolyFromNode(node.args[1],name,maxDegree);
      if(!m1||!m2)return null;return finslerV7PolyMul(m1,m2,maxDegree);
    }
    if(node.op==="/"&&node.args.length===2){
      var pn=finslerV7PolyFromNode(node.args[0],name,maxDegree),pd=finslerV7PolyFromNode(node.args[1],name,maxDegree);
      if(!pn||!pd||finslerV7PolyDegree(pd)!==0)return null;
      var dc=pd[0],q=Object.create(null);Object.keys(pn).forEach(function(k){q[k]="("+pn[k]+")/("+dc+")";});return finslerV7PolyNorm(q);
    }
    if(node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var exp=Number(node.args[1].value);
      if(Number.isInteger(exp)&&exp>=0&&exp<=8){
        var base=finslerV7PolyFromNode(node.args[0],name,maxDegree);if(!base)return null;
        return finslerV7PolyPow(base,exp,maxDegree);
      }
    }
  }
  if(finslerV7ContainsSymbol(node,name))return null;
  return {0:node.toString({parenthesis:"auto"})};
}
function finslerV7PolyRender(p,name){
  p=finslerV7PolyNorm(p);var degs=Object.keys(p).map(Number).sort(function(a,b){return b-a;});
  if(!degs.length)return "0";
  var terms=[];
  degs.forEach(function(d){
    var c=finslerSimplifyText(p[d]);if(finslerV7IsZero(c))return;
    var power=d===0?"":(d===1?name:name+"^"+d),term;
    if(d===0)term=c;
    else if(c==="1")term=power;
    else if(c==="-1")term="-"+power;
    else term=finslerV7FactorAtom(c)+"*"+power;
    terms.push(term);
  });
  if(!terms.length)return "0";
  return terms.join("+").replace(/\+\-/g,"-");
}
function finslerV7PolyDivideText(numerator,divisor){
  var dnode,nnode,symbols=[];
  try{dnode=math.parse(divisor);nnode=math.parse(numerator);}catch(e){return null;}
  dnode.traverse(function(child){if(child&&child.isSymbolNode&&symbols.indexOf(child.name)===-1)symbols.push(child.name);});
  for(var si=0;si<symbols.length;si++){
    var name=symbols[si],dp=finslerV7PolyFromNode(dnode,name,10),np=finslerV7PolyFromNode(nnode,name,10);
    if(!dp||!np)continue;
    var dd=finslerV7PolyDegree(dp),nd=finslerV7PolyDegree(np);
    if(dd<1||dd>4||nd<dd||nd>10)continue;
    var rem=finslerV7PolyNorm(np),quot=Object.create(null),guard=0;
    while(finslerV7PolyDegree(rem)>=dd&&guard++<16){
      var rd=finslerV7PolyDegree(rem),leadR=rem[rd],leadD=dp[dd];
      var qd=rd-dd,qc=finslerSimplifyText("("+leadR+")/("+leadD+")");
      quot[qd]=quot[qd]===undefined?qc:finslerSimplifyText("("+quot[qd]+")+("+qc+")");
      var sub=Object.create(null);
      Object.keys(dp).forEach(function(k){sub[Number(k)+qd]="("+qc+")*("+dp[k]+")";});
      rem=finslerV7PolyAdd(rem,sub,-1);
    }
    if(finslerV7PolyDegree(rem)===-1){
      return finslerV7FactorCanonical(finslerV7PolyRender(quot,name));
    }
  }
  return null;
}

/* Reduce one rational pair. Besides literal factor cancellation, try exact
 * polynomial division by remaining additive denominator factors. */
function finslerV7ReducePair(num,den){
  num=finslerSimplifyText(num);den=finslerSimplifyText(den);
  if(num==="0")return {num:"0",den:"1"};
  var numNode,denNode;
  try{numNode=math.parse(num);denNode=math.parse(den);}catch(e){return {num:num,den:den};}
  var nf=finslerFactorExpression(numNode),df=finslerFactorExpression(denNode);
  var cancel=Object.create(null);
  nf.order.forEach(function(key){if(df.map[key]){var p=Math.min(nf.map[key].power,df.map[key].power);if(p>0)cancel[key]=p;}});
  var n=finslerV7ProductText(nf,cancel);

  /* Hidden polynomial cancellation, e.g.
     2*rs*r-rs^2-r^2 = -(r-rs)^2 against a remaining (rs-r) denominator. */
  df.order.forEach(function(key){
    var used=cancel[key]||0,remaining=df.map[key].power-used;
    if(remaining<=0)return;
    var factor=df.map[key].text,fnode;
    try{fnode=math.parse(factor);}catch(e){return;}
    while(fnode&&fnode.isParenthesisNode)fnode=fnode.content;
    var additive=fnode&&fnode.isOperatorNode&&(fnode.op==="+"||(fnode.op==="-"&&fnode.args.length===2));
    if(!additive)return;
    for(var q=0;q<remaining;q++){
      var quotient=finslerV7PolyDivideText(n,factor);
      if(!quotient)break;
      n=quotient;cancel[key]=(cancel[key]||0)+1;
    }
  });

  var d=finslerV7ProductText(df,cancel);
  n=finslerV7FactorCanonical(n);
  if(nf.sign*df.sign<0)n="-"+n;
  if(n==="0")return {num:"0",den:"1"};
  if(d==="1")return {num:n,den:"1"};
  if(d==="-1")return {num:n.charAt(0)==="-"?n.slice(1):"-"+n,den:"1"};
  return {num:n,den:d};
}

function finslerV7RationalPair(node){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return {num:"0",den:"1"};
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){var u=finslerV7RationalPair(node.args[0]);return finslerV7ReducePair("-("+u.num+")",u.den);}
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerV7RationalPair(node.args[0]),b=finslerV7RationalPair(node.args[1]);
      return finslerV7ReducePair("("+a.num+")*("+b.den+")"+node.op+"("+b.num+")*("+a.den+")","("+a.den+")*("+b.den+")");
    }
    if(node.op==="*"&&node.args.length===2){var m1=finslerV7RationalPair(node.args[0]),m2=finslerV7RationalPair(node.args[1]);return finslerV7ReducePair("("+m1.num+")*("+m2.num+")","("+m1.den+")*("+m2.den+")");}
    if(node.op==="/"&&node.args.length===2){var d1=finslerV7RationalPair(node.args[0]),d2=finslerV7RationalPair(node.args[1]);return finslerV7ReducePair("("+d1.num+")*("+d2.den+")","("+d1.den+")*("+d2.num+")");}
    if(node.op==="^"&&node.args.length===2&&node.args[1].isConstantNode){
      var p=Number(node.args[1].value);
      if(Number.isInteger(p)){var base=finslerV7RationalPair(node.args[0]),q=Math.abs(p);return p>=0?finslerV7ReducePair("("+base.num+")^("+q+")","("+base.den+")^("+q+")"):finslerV7ReducePair("("+base.den+")^("+q+")","("+base.num+")^("+q+")");}
    }
  }
  return {num:finslerCanonicalNodeText(node),den:"1"};
}
function finslerV7RationalCanonical(expr){
  var text=String(expr),node;try{node=math.parse(text);}catch(e){return text;}
  var pair=finslerV7RationalPair(node);return pair.den==="1"?pair.num:"("+pair.num+")/("+pair.den+")";
}
function finslerV7Choose(base,canonical){
  if(!canonical)return base;var a=finslerV7Score(base),b=finslerV7Score(canonical);
  if(b<a)return canonical;
  var bf=finslerV7HasFactorableSum(base),cf=finslerV7HasFactorableSum(canonical);
  if(bf&&!cf&&b<=a+12)return canonical;
  if(b===a&&/[+-]/.test(base)&&canonical.indexOf("*(")!==-1)return canonical;
  return base;
}

/* COMPUTATIONAL simplifier: this result is fed into subsequent calculations. */
S=function(expr){
  var original=raw(expr);if(finslerV7ComputeCache[original]!==undefined)return finslerV7ComputeCache[original];
  var best=finslerV7BaseS(original);
  if(finslerV7Score(best)<=1800&&(best.indexOf("/")!==-1||/[+-]/.test(best)))best=finslerV7Choose(best,finslerV7RationalCanonical(best));
  finslerV7ComputeCache[original]=best;finslerV7ComputeCache[best]=best;return best;
};
PS=function(expr){
  var original=raw(expr);if(finslerV7PresentCache[original]!==undefined)return finslerV7PresentCache[original];
  var best=S(original);if(finslerV7Score(best)<=7000)best=finslerV7Choose(best,finslerV7RationalCanonical(best));
  finslerV7PresentCache[original]=best;finslerV7PresentCache[best]=best;return best;
};

onmessage=function(event){
  if(event&&event.data&&event.data.type==="calculate"){finslerV7ComputeCache=Object.create(null);finslerV7PresentCache=Object.create(null);}
  finslerV7BaseOnMessage(event);
};