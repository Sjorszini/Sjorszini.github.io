"use strict";

/* Final orchestration layer.
 * v4 already gives us the verified geometry engine, the regression-tested
 * strong affine/inverse presentation reducer, and short rational
 * canonicalization.  This layer keeps the latter out of y-dependent spray
 * algebra, normalizes opposite even powers before strong CAS, and avoids the
 * expensive CAS on spray output itself.
 */
importScripts("finsler-worker-v4.js?v=6");

var finslerV5CanonicalS=S;
var finslerV5StableS=finslerStableS;
var finslerV5StrongPS=finslerStrongPS;
var finslerV5Post=self.postMessage;

/* Only run the extra rational canonicalizer on genuinely small coordinate-only
 * expressions.  These are exactly the inverse/connection-style expressions
 * that otherwise cause downstream expression swell.  Fiber-dependent spray
 * polynomials stay on the fast verified math.js simplifier. */
S=function(expr){
  var original=raw(expr),base=finslerV5StableS(original);
  if(/\by\d+\b/.test(base)||finslerCompactLength(base)>46||finslerOpCount(base)>9)return base;
  return finslerV5CanonicalS(original);
};

function finslerV5NormalizeEvenDifferences(text){
  var root;
  try{root=math.parse(String(text));}catch(e){return String(text);}
  function visit(node){
    var mapped=node;
    if(node&&typeof node.map==="function"){
      try{mapped=node.map(function(child){return visit(child);});}catch(e2){}
    }
    var n=mapped;while(n&&n.isParenthesisNode)n=n.content;
    if(!n||!n.isOperatorNode||n.op!=="^"||n.args.length!==2)return mapped;
    var p=finslerIntegerExponent(n.args[1]);
    if(p===null||p%2!==0)return mapped;
    var base=n.args[0];while(base&&base.isParenthesisNode)base=base.content;
    if(!base||!base.isOperatorNode||base.op!=="-"||base.args.length!==2)return mapped;
    var a=base.args[0].toString({parenthesis:"auto"}),b=base.args[1].toString({parenthesis:"auto"});
    /* One canonical orientation means (a-b)^(2n) and (b-a)^(2n) become
       literally identical, allowing ordinary collection/cancellation. */
    if(a.localeCompare(b)>=0)return mapped;
    try{return math.parse("("+b+"-("+a+"))^"+p);}catch(e3){return mapped;}
  }
  var result;
  try{result=visit(root).toString({parenthesis:"auto"});}catch(e4){return String(text);}
  return finslerEquivalentNumerically(text,result)?result:String(text);
}

/* Normalize exact sign-opposite even factors before the already-tested strong
 * reducer sees the expression.  A final direct Nerdamer attempt is allowed only
 * for bounded results and is accepted only after numerical equivalence checks. */
finslerStrongPS=function(expr){
  var original=raw(expr),normalized=finslerV5NormalizeEvenDifferences(original);
  var best=finslerV5StrongPS(normalized);
  if(finslerCompactLength(best)>45&&finslerCompactLength(best)<=220&&finslerOpCount(best)<=30){
    var candidate=finslerNerdamerCandidate(finslerV5NormalizeEvenDifferences(best),true);
    if(candidate){candidate=finslerFractionForm(candidate);best=finslerPrefer(best,candidate,true);}
  }
  return finslerEquivalentNumerically(original,best)?best:finslerV5StrongPS(original);
};

/* Strong CAS is useful for inverse/connection/curvature quantities, but it is
 * disproportionately expensive on spray polynomials in the fiber variables.
 * Spray still passes through S/PS and the cheap final canonicalizer below. */
finslerStrongOutputSection=function(section){
  return section!=="spray"&&section!=="metric"&&!!section;
};

function finslerV5CheapFinal(value){
  if(typeof value==="string"){
    var base=value;
    if(finslerCompactLength(base)<=90&&finslerOpCount(base)<=14){
      var c=finslerShortCanonical(base);
      if(finslerEquivalentNumerically(base,c))return c;
    }
    return base;
  }
  if(Array.isArray(value))return value.map(finslerV5CheapFinal);
  if(value&&typeof value==="object"){
    var out={};Object.keys(value).forEach(function(k){out[k]=finslerV5CheapFinal(value[k]);});return out;
  }
  return value;
}

self.postMessage=function(message,transfer){
  var outgoing=message;
  if(message&&message.section==="spray"){
    if(message.type==="component"&&typeof message.value==="string")outgoing=Object.assign({},message,{value:finslerV5CheapFinal(message.value)});
    else if(message.type==="sectionComplete"&&message.summary)outgoing=Object.assign({},message,{summary:finslerV5CheapFinal(message.summary)});
  }
  if(transfer!==undefined)return finslerV5Post(outgoing,transfer);
  return finslerV5Post(outgoing);
};
