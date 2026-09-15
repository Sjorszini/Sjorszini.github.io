"use strict";

/*
 * Thin canonicalization layer over the last worker revision that passed the
 * complete Schwarzschild curvature/Ricci regression.  Keep that verified
 * geometry/presentation implementation intact and only strengthen S(expr) for
 * short rational expressions, so compact forms are reused downstream.
 */
importScripts("finsler-worker-v4-stable.js?v=1");

var finslerStableS=S;
var finslerStableOnMessage=onmessage;
var finslerShortComputeCache=Object.create(null);

function finslerShortUnwrap(node){while(node&&node.isParenthesisNode)node=node.content;return node;}
function finslerShortInteger(node){
  node=finslerShortUnwrap(node);
  if(node&&node.isConstantNode){var n=Number(node.value);return Number.isInteger(n)?n:null;}
  if(node&&node.isOperatorNode&&node.op==="-"&&node.args.length===1){
    var a=finslerShortUnwrap(node.args[0]);
    if(a&&a.isConstantNode){var m=-Number(a.value);return Number.isInteger(m)?m:null;}
  }
  return null;
}

/* Convert a bounded algebraic expression into one numerator/denominator pair.
 * This is deliberately not a general CAS: it handles only arithmetic and
 * integer powers, treating functions/other nodes as indivisible atoms. */
function finslerShortPair(node){
  node=finslerShortUnwrap(node);
  if(!node)return null;
  if(node.isOperatorNode){
    if(node.op==="-"&&node.args.length===1){
      var u=finslerShortPair(node.args[0]);
      return u?{num:"-("+u.num+")",den:u.den}:null;
    }
    if((node.op==="+"||node.op==="-")&&node.args.length===2){
      var a=finslerShortPair(node.args[0]),b=finslerShortPair(node.args[1]);
      if(!a||!b)return null;
      return {num:"("+a.num+")*("+b.den+")"+node.op+"("+b.num+")*("+a.den+")",den:"("+a.den+")*("+b.den+")"};
    }
    if(node.op==="*"&&node.args.length===2){
      var m1=finslerShortPair(node.args[0]),m2=finslerShortPair(node.args[1]);
      if(!m1||!m2)return null;
      return {num:"("+m1.num+")*("+m2.num+")",den:"("+m1.den+")*("+m2.den+")"};
    }
    if(node.op==="/"&&node.args.length===2){
      var d1=finslerShortPair(node.args[0]),d2=finslerShortPair(node.args[1]);
      if(!d1||!d2)return null;
      return {num:"("+d1.num+")*("+d2.den+")",den:"("+d1.den+")*("+d2.num+")"};
    }
    if(node.op==="^"&&node.args.length===2){
      var p=finslerShortInteger(node.args[1]);
      if(p!==null&&Math.abs(p)<=8){
        var q=finslerShortPair(node.args[0]);if(!q)return null;
        var e=Math.abs(p),num="("+q.num+")^"+e,den="("+q.den+")^"+e;
        return p>=0?{num:num,den:den}:{num:den,den:num};
      }
    }
  }
  return {num:node.toString({parenthesis:"auto"}),den:"1"};
}

function finslerShortCollectTerms(node,sign,out){
  node=finslerShortUnwrap(node);
  if(node&&node.isOperatorNode){
    if(node.op==="+"&&node.args.length===2){finslerShortCollectTerms(node.args[0],sign,out);finslerShortCollectTerms(node.args[1],sign,out);return;}
    if(node.op==="-"&&node.args.length===2){finslerShortCollectTerms(node.args[0],sign,out);finslerShortCollectTerms(node.args[1],-sign,out);return;}
    if(node.op==="-"&&node.args.length===1){finslerShortCollectTerms(node.args[0],-sign,out);return;}
  }
  out.push({node:node,sign:sign});
}
function finslerShortTerm(node,sign){
  var symbols=Object.create(null),others=[],coefficient=sign;
  function walk(n){
    n=finslerShortUnwrap(n);if(!n)return;
    if(n.isOperatorNode&&n.op==="-"&&n.args.length===1){coefficient*=-1;walk(n.args[0]);return;}
    if(n.isOperatorNode&&n.op==="*"){n.args.forEach(walk);return;}
    if(n.isConstantNode){var v=Number(n.value);if(Number.isFinite(v)){coefficient*=v;return;}}
    if(n.isSymbolNode){symbols[n.name]=(symbols[n.name]||0)+1;return;}
    if(n.isOperatorNode&&n.op==="^"&&n.args.length===2){
      var p=finslerShortInteger(n.args[1]),base=finslerShortUnwrap(n.args[0]);
      if(p!==null&&p>0&&base&&base.isSymbolNode){symbols[base.name]=(symbols[base.name]||0)+p;return;}
    }
    others.push(n.toString({parenthesis:"auto"}));
  }
  walk(node);return {coefficient:coefficient,symbols:symbols,others:others};
}
function finslerShortTermText(term,remove){
  var parts=[],c=term.coefficient,abs=Math.abs(c);
  if(abs!==1||(!Object.keys(term.symbols).length&&!term.others.length))parts.push(String(abs));
  Object.keys(term.symbols).sort().forEach(function(name){
    var p=term.symbols[name]-(remove[name]||0);if(p<=0)return;
    parts.push(p===1?name:name+"^"+p);
  });
  term.others.forEach(function(x){parts.push("("+x+")");});
  var body=parts.length?parts.join("*"):"1";
  return (c<0?"-":"")+body;
}
function finslerShortFactorNumerator(text){
  var node;try{node=math.parse(String(text));}catch(e){return String(text);}
  var rawTerms=[];finslerShortCollectTerms(node,1,rawTerms);
  if(rawTerms.length<2)return String(text);
  var terms=rawTerms.map(function(t){return finslerShortTerm(t.node,t.sign);});
  var common=Object.create(null),names=Object.keys(terms[0].symbols);
  names.forEach(function(name){
    var p=terms[0].symbols[name]||0;
    for(var i=1;i<terms.length;i++)p=Math.min(p,terms[i].symbols[name]||0);
    if(p>0)common[name]=p;
  });
  if(!Object.keys(common).length)return String(text);
  var residual="";
  terms.forEach(function(term,index){
    var t=finslerShortTermText(term,common);
    if(index===0)residual=t;
    else residual+=(t.charAt(0)==="-"?t:"+"+t);
  });
  try{residual=math.simplify(residual).toString({parenthesis:"auto"});}catch(e2){}
  var factors=[];Object.keys(common).sort().forEach(function(name){var p=common[name];factors.push(p===1?name:name+"^"+p);});
  var factored=factors.join("*")+"*("+residual+")";
  return finslerEquivalentNumerically(text,factored)?factored:String(text);
}

function finslerShortCanonical(text){
  text=String(text);
  if(finslerCompactLength(text)>82||finslerOpCount(text)>13)return text;
  if(!/[+\-]/.test(text.replace(/^[-+]/,"")))return text;
  var node,pair;try{node=math.parse(text);pair=finslerShortPair(node);}catch(e){return text;}
  if(!pair)return text;
  var num=pair.num,den=pair.den;
  try{num=math.simplify(num).toString({parenthesis:"auto"});den=math.simplify(den).toString({parenthesis:"auto"});}catch(e2){return text;}
  /* If common-denominator construction still contains division, this is beyond
     the deliberately small rational subset; leave the verified base form. */
  if(num.indexOf("/")!==-1||den.indexOf("/")!==-1)return text;
  num=finslerShortFactorNumerator(num);
  var candidate=den.replace(/\s+/g,"")==="1"?num:"("+num+")/("+den+")";
  candidate=finslerFractionForm(candidate);
  if(!finslerEquivalentNumerically(text,candidate))return text;
  return finslerPrefer(text,candidate,true);
}

/* Computational canonicalization: this exact returned string is subsequently
 * differentiated/contracted by the verified geometry engine. */
S=function(expr){
  var original=raw(expr);
  if(finslerShortComputeCache[original]!==undefined)return finslerShortComputeCache[original];
  var base=finslerStableS(original),best=finslerShortCanonical(base);
  finslerShortComputeCache[original]=best;
  finslerShortComputeCache[best]=best;
  return best;
};

/* The stable worker previously used its strong final reducer only for inverse
 * and affine-curvature sections. Use the same already-regression-tested reducer
 * for every output section now. */
finslerStrongOutputSection=function(section){return !!section;};

onmessage=function(event){
  finslerShortComputeCache=Object.create(null);
  finslerStableOnMessage(event);
};
