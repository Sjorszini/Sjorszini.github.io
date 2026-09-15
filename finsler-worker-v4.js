"use strict";

/* Final orchestration layer over the verified stable/canonical workers. */
importScripts("finsler-worker-v4-canonical.js?v=1");

var finslerV5CanonicalS=S;
var finslerV5StableS=finslerStableS;
var finslerV5StrongPS=finslerStrongPS;
var finslerV5Post=self.postMessage;

/* Only run the extra rational canonicalizer on genuinely small coordinate-only
 * expressions. Fiber-dependent spray polynomials stay on the fast verified
 * math.js simplifier. */
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
    if(a.localeCompare(b)>=0)return mapped;
    try{return math.parse("("+b+"-("+a+"))^"+p);}catch(e3){return mapped;}
  }
  var result;
  try{result=visit(root).toString({parenthesis:"auto"});}catch(e4){return String(text);}
  return finslerEquivalentNumerically(text,result)?result:String(text);
}

finslerStrongPS=function(expr){
  var original=raw(expr),normalized=finslerV5NormalizeEvenDifferences(original);
  var best=finslerV5StrongPS(normalized);
  if(finslerCompactLength(best)>45&&finslerCompactLength(best)<=220&&finslerOpCount(best)<=30){
    var candidate=finslerNerdamerCandidate(finslerV5NormalizeEvenDifferences(best),true);
    if(candidate){candidate=finslerFractionForm(candidate);best=finslerPrefer(best,candidate,true);}
  }
  return finslerEquivalentNumerically(original,best)?best:finslerV5StrongPS(original);
};

/* Nerdamer on spray polynomials was the source of multi-second regressions.
 * Spray still gets the computational/cheap final canonical passes. */
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
