"use strict";

importScripts("finsler-worker-v4-square.js?v=1");

var finslerV7StrongPS=finslerStrongPS;
var finslerV7BaseS=S;

function finslerV7PerfectSquareNode(node){
  var rawTerms=[];
  try{finslerShortCollectTerms(node,1,rawTerms);}catch(e){return null;}
  if(rawTerms.length!==3)return null;
  var terms=rawTerms.map(function(t){return finslerShortTerm(t.node,t.sign);});
  var squares=[],cross=null;
  for(var i=0;i<terms.length;i++){
    var t=terms[i],names=Object.keys(t.symbols),others=t.others||[];
    if(others.length)return null;
    if(t.coefficient===1&&names.length===1&&t.symbols[names[0]]===2){squares.push(names[0]);continue;}
    if((t.coefficient===2||t.coefficient===-2)&&names.length===2&&t.symbols[names[0]]===1&&t.symbols[names[1]]===1){cross={coefficient:t.coefficient,names:names.sort()};continue;}
    return null;
  }
  if(squares.length!==2||!cross)return null;
  squares.sort();
  if(cross.names[0]!==squares[0]||cross.names[1]!==squares[1])return null;
  /* Prefer the coordinate-looking / lexicographically larger symbol first, so
     rs^2-2 rs r+r^2 is represented as (r-rs)^2 rather than (rs-r)^2. */
  var a=squares[1],b=squares[0],op=cross.coefficient<0?"-":"+";
  try{return math.parse("("+a+op+b+")^2");}catch(e2){return null;}
}

function finslerV7NormalizePerfectSquares(text){
  var root;
  try{root=math.parse(String(text));}catch(e){return String(text);}
  function visit(node){
    var mapped=node;
    if(node&&typeof node.map==="function"){
      try{mapped=node.map(function(child){return visit(child);});}catch(e2){}
    }
    var n=mapped;while(n&&n.isParenthesisNode)n=n.content;
    if(n&&n.isOperatorNode&&(n.op==="+"||n.op==="-")&&n.args.length===2){
      var square=finslerV7PerfectSquareNode(n);if(square)return square;
    }
    return mapped;
  }
  var out;
  try{out=visit(root).toString({parenthesis:"auto"});}catch(e3){return String(text);}
  return finslerEquivalentNumerically(text,out)?out:String(text);
}

function finslerV7CanonicalDifferenceAtom(atom,state){
  var n;
  try{n=math.parse(String(atom));}catch(e){return String(atom);}
  while(n&&n.isParenthesisNode)n=n.content;
  if(!n||!n.isOperatorNode||n.op!=="-"||n.args.length!==2)return String(atom);
  var a=n.args[0],b=n.args[1];
  while(a&&a.isParenthesisNode)a=a.content;
  while(b&&b.isParenthesisNode)b=b.content;
  /* Only orient a simple symbol difference. This is enough to canonicalize
     (rs-r) versus (r-rs) without rewriting more complicated subexpressions. */
  if(!a||!b||!a.isSymbolNode||!b.isSymbolNode)return String(atom);
  if(a.name.localeCompare(b.name)>=0)return String(atom);
  state.sign*=-1;
  return b.name+"-"+a.name;
}

function finslerV7PushFactors(node,toDen,state){
  while(node&&node.isParenthesisNode)node=node.content;
  if(!node)return;
  if(node.isOperatorNode&&node.op==="-"&&node.args.length===1){state.sign*=-1;finslerV7PushFactors(node.args[0],toDen,state);return;}
  if(node.isOperatorNode&&node.op==="*"&&node.args.length>=2){node.args.forEach(function(a){finslerV7PushFactors(a,toDen,state);});return;}
  if(node.isOperatorNode&&node.op==="/"&&node.args.length===2){finslerV7PushFactors(node.args[0],toDen,state);finslerV7PushFactors(node.args[1],!toDen,state);return;}
  if(node.isOperatorNode&&node.op==="^"&&node.args.length===2){
    var p=finslerIntegerExponent(node.args[1]);
    if(p!==null&&p!==0&&Math.abs(p)<=8){
      var target=(p>0?toDen:!toDen)?state.den:state.num;
      var base=node.args[0].toString({parenthesis:"auto"}),count=Math.abs(p);
      base=finslerV7CanonicalDifferenceAtom(base,state);
      for(var i=0;i<count;i++)target.push(base);
      return;
    }
  }
  var atom=node.toString({parenthesis:"auto"});
  if(atom==="1")return;
  if(atom==="-1"){state.sign*=-1;return;}
  atom=finslerV7CanonicalDifferenceAtom(atom,state);
  (toDen?state.den:state.num).push(atom);
}

function finslerV7FactorText(atom){
  var n;try{n=math.parse(atom);}catch(e){return "("+atom+")";}
  while(n&&n.isParenthesisNode)n=n.content;
  if(n&&(n.isSymbolNode||n.isConstantNode||n.isFunctionNode))return atom;
  return "("+atom+")";
}
function finslerV7GroupedText(items){
  var groups=[];
  items.forEach(function(atom){
    var found=null;
    for(var i=0;i<groups.length;i++)if(finslerFactorRelation(groups[i].atom,atom)===1){found=groups[i];break;}
    if(found)found.count++;else groups.push({atom:atom,count:1});
  });
  groups.sort(function(a,b){return a.atom.localeCompare(b.atom);});
  return groups.map(function(g){var base=finslerV7FactorText(g.atom);return g.count===1?base:base+"^"+g.count;}).join("*");
}

function finslerV7CancelPowers(text){
  var root;try{root=math.parse(String(text));}catch(e){return String(text);}
  var state={num:[],den:[],sign:1};finslerV7PushFactors(root,false,state);
  for(var ni=state.num.length-1;ni>=0;ni--){
    for(var di=state.den.length-1;di>=0;di--){
      var rel=finslerFactorRelation(state.num[ni],state.den[di]);
      if(!rel)continue;
      state.num.splice(ni,1);state.den.splice(di,1);if(rel<0)state.sign*=-1;break;
    }
  }
  var ntext=finslerV7GroupedText(state.num)||"1",dtext=finslerV7GroupedText(state.den);
  if(state.sign<0)ntext="-"+ntext;
  var candidate=dtext?ntext+"/("+dtext+")":ntext;
  return finslerEquivalentNumerically(text,candidate)?candidate:String(text);
}

/* Cheap exact rational canonicalization for short fiber-dependent expressions.
 * The previous fast layer intentionally skipped all y-dependent expressions,
 * which let elementary spray terms such as
 *   -rs*r*y_t*y_r/(r^2*rs-r^3)
 * survive unchanged.  Factor numerator AND denominator, expand only small
 * integer powers into multiplicities, cancel exact/opposite factors, and keep
 * the rewrite only after the existing numerical-equivalence guard accepts it. */
function finslerV7ComputationalCanonical(text){
  text=String(text);
  if(finslerCompactLength(text)>82||finslerOpCount(text)>13)return text;
  var node,pair;
  try{node=math.parse(text);pair=finslerShortPair(node);}catch(e){return text;}
  if(!pair)return text;
  var num=pair.num,den=pair.den;
  try{
    num=math.simplify(num).toString({parenthesis:"auto"});
    den=math.simplify(den).toString({parenthesis:"auto"});
  }catch(e2){return text;}
  if(num.indexOf("/")!==-1||den.indexOf("/")!==-1)return text;
  num=finslerShortFactorNumerator(num);
  den=finslerShortFactorNumerator(den);
  var candidate=den.replace(/\s+/g,"")==="1"?num:"("+num+")/("+den+")";
  candidate=finslerV7CancelPowers(candidate);
  if(!finslerEquivalentNumerically(text,candidate))return text;
  return finslerPrefer(text,candidate,true);
}

/* Computational boundary: short rational expressions containing fiber
 * coordinates now receive the same safe factor/cancel treatment before they
 * are differentiated or contracted downstream.  No Nerdamer call occurs here. */
S=function(expr){
  var original=raw(expr),base=finslerV7BaseS(original);
  if(/\by\d+\b/.test(base)&&finslerCompactLength(base)<=82&&finslerOpCount(base)<=13){
    var candidate=finslerV7ComputationalCanonical(base);
    if(finslerEquivalentNumerically(base,candidate))return candidate;
  }
  return base;
};

finslerStrongPS=function(expr){
  var original=raw(expr),best=finslerV7StrongPS(original);
  if(finslerCompactLength(best)<=260&&finslerOpCount(best)<=40){
    var normalized=finslerV7NormalizePerfectSquares(best);
    var cancelled=finslerV7CancelPowers(normalized);
    best=finslerPrefer(best,cancelled,true);
  }
  return finslerEquivalentNumerically(original,best)?best:finslerV7StrongPS(original);
};
