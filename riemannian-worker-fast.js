"use strict";

/* Fast exact symbolic layer for curvature calculations.
   math.js remains responsible for parsing and differentiation.  Final
   rational cancellation is performed here with exact BigInt coefficients,
   avoiding math.rationalize() and external worker dependencies. */
importScripts("riemannian-worker.js?v=2");

var canonicalCache=Object.create(null);

S=function(expr){
  var text=raw(expr);if(simplifyCache[text]!==undefined)return simplifyCache[text];
  var out=text;try{out=math.simplify(text).toString({parenthesis:"auto"});}catch(e){}
  simplifyCache[text]=out;simplifyCache[out]=out;return out;
};

function absBig(n){return n<0n?-n:n;}
function gcdBig(a,b){a=absBig(a);b=absBig(b);while(b){var t=a%b;a=b;b=t;}return a||1n;}
function Q(n,d){
  n=BigInt(n);d=BigInt(d===undefined?1:d);if(d===0n)throw new Error("zero denominator");
  if(d<0n){n=-n;d=-d;}if(n===0n)return {n:0n,d:1n};
  var g=gcdBig(n,d);return {n:n/g,d:d/g};
}
function qAdd(a,b){return Q(a.n*b.d+b.n*a.d,a.d*b.d);}
function qMul(a,b){return Q(a.n*b.n,a.d*b.d);}
function qDiv(a,b){if(b.n===0n)throw new Error("division by zero");return Q(a.n*b.d,a.d*b.n);}
function qNeg(a){return {n:-a.n,d:a.d};}
function qPow(a,n){
  if(n===0)return Q(1);var neg=n<0;n=Math.abs(n);var out=Q(1),base=a;
  while(n){if(n&1)out=qMul(out,base);base=qMul(base,base);n=Math.floor(n/2);}
  return neg?qDiv(Q(1),out):out;
}
function qOne(a){return a.n===1n&&a.d===1n;}
function qMinusOne(a){return a.n===-1n&&a.d===1n;}

function numberQ(value){
  var s=String(value).trim().toLowerCase(),sign=1n;
  if(s[0]==="-"){sign=-1n;s=s.slice(1);}else if(s[0]==="+")s=s.slice(1);
  var parts=s.split("e"),mant=parts[0],exp=parts.length>1?Number(parts[1]):0;
  if(!Number.isInteger(exp))throw new Error("non-rational number");
  var dot=mant.indexOf("."),frac=0;
  if(dot>=0){frac=mant.length-dot-1;mant=mant.slice(0,dot)+mant.slice(dot+1);}
  if(!/^\d+$/.test(mant))throw new Error("non-rational number");
  var n=sign*BigInt(mant||"0"),d=10n**BigInt(frac);
  if(exp>0)n*=10n**BigInt(exp);else if(exp<0)d*=10n**BigInt(-exp);
  return Q(n,d);
}

function newPoly(){return Object.create(null);}
function cloneQ(a){return {n:a.n,d:a.d};}
function polyConst(q){var p=newPoly();if(q.n!==0n)p[""]=cloneQ(q);return p;}
function monomialKey(exps){
  return Object.keys(exps).map(Number).filter(function(id){return exps[id];}).sort(function(a,b){return a-b;}).map(function(id){return id+":"+exps[id];}).join(",");
}
function parseMonomial(key){
  var out=Object.create(null);if(!key)return out;
  key.split(",").forEach(function(pair){var p=pair.split(":");out[Number(p[0])]=Number(p[1]);});return out;
}
function addPolyTerm(poly,key,q){
  if(q.n===0n)return;
  if(poly[key]){var next=qAdd(poly[key],q);if(next.n===0n)delete poly[key];else poly[key]=next;}
  else poly[key]=cloneQ(q);
}
function checkBudget(poly,ctx){
  if(ctx.ops>ctx.maxOps||Object.keys(poly).length>ctx.maxTerms)throw new Error("canonicalization budget exceeded");
}
function polyAdd(a,b,ctx,sign){
  var out=newPoly(),k;for(k in a)out[k]=cloneQ(a[k]);
  for(k in b){ctx.ops++;addPolyTerm(out,k,sign===-1?qNeg(b[k]):b[k]);}
  checkBudget(out,ctx);return out;
}
function multiplyKeys(ka,kb){
  var a=parseMonomial(ka),b=parseMonomial(kb),id;for(id in b)a[id]=(a[id]||0)+b[id];return monomialKey(a);
}
function polyMul(a,b,ctx){
  var out=newPoly(),ka,kb;
  for(ka in a)for(kb in b){ctx.ops++;addPolyTerm(out,multiplyKeys(ka,kb),qMul(a[ka],b[kb]));if((ctx.ops&127)===0)checkBudget(out,ctx);}
  checkBudget(out,ctx);return out;
}
function polyScale(a,q){var out=newPoly(),k;for(k in a){var v=qMul(a[k],q);if(v.n!==0n)out[k]=v;}return out;}
function polyPow(a,n,ctx){
  if(n===0)return polyConst(Q(1));var out=polyConst(Q(1)),base=a;
  while(n){if(n&1)out=polyMul(out,base,ctx);n=Math.floor(n/2);if(n)base=polyMul(base,base,ctx);}
  return out;
}
function polyAtom(id){var p=newPoly();p[id+":1"]=Q(1);return p;}
function polyZero(p){return Object.keys(p).length===0;}

function atomId(text,ctx){
  text=String(text);if(ctx.atomIds[text]!==undefined)return ctx.atomIds[text];
  var id=ctx.atoms.length;ctx.atomIds[text]=id;ctx.atoms.push(text);return id;
}
function atomRF(node,ctx){var id=atomId(node.toString({parenthesis:"auto"}),ctx);return {n:polyAtom(id),d:polyConst(Q(1))};}
function rfConst(q){return {n:polyConst(q),d:polyConst(Q(1))};}
function rfAdd(a,b,ctx,sign){return {n:polyAdd(polyMul(a.n,b.d,ctx),polyMul(b.n,a.d,ctx),ctx,sign),d:polyMul(a.d,b.d,ctx)};}
function rfMul(a,b,ctx){return {n:polyMul(a.n,b.n,ctx),d:polyMul(a.d,b.d,ctx)};}
function rfDiv(a,b,ctx){if(polyZero(b.n))throw new Error("division by zero");return {n:polyMul(a.n,b.d,ctx),d:polyMul(a.d,b.n,ctx)};}
function rfPow(a,n,ctx){
  if(Math.abs(n)>16)throw new Error("power outside canonicalization budget");
  if(n>=0)return {n:polyPow(a.n,n,ctx),d:polyPow(a.d,n,ctx)};
  return {n:polyPow(a.d,-n,ctx),d:polyPow(a.n,-n,ctx)};
}
function integerExponent(node){
  if(node&&node.isParenthesisNode)return integerExponent(node.content);
  if(node&&node.isConstantNode){var s=String(node.value);if(/^-?\d+$/.test(s))return Number(s);return null;}
  if(node&&node.isOperatorNode&&node.args&&node.args.length===1&&node.op==="-"){
    var v=integerExponent(node.args[0]);return v===null?null:-v;
  }
  return null;
}
function rfFromNode(node,ctx){
  if(node.isParenthesisNode)return rfFromNode(node.content,ctx);
  if(node.isConstantNode){try{return rfConst(numberQ(node.value));}catch(e){return atomRF(node,ctx);}}
  if(node.isSymbolNode||node.isFunctionNode)return atomRF(node,ctx);
  if(!node.isOperatorNode||!node.args)return atomRF(node,ctx);
  var args=node.args,op=node.op,i,out,exp;
  if(op==="+"&&args.length){out=rfFromNode(args[0],ctx);for(i=1;i<args.length;i++)out=rfAdd(out,rfFromNode(args[i],ctx),ctx,1);return out;}
  if(op==="-"&&args.length===1){out=rfFromNode(args[0],ctx);out.n=polyScale(out.n,Q(-1));return out;}
  if(op==="-"&&args.length===2)return rfAdd(rfFromNode(args[0],ctx),rfFromNode(args[1],ctx),ctx,-1);
  if(op==="*"&&args.length){out=rfFromNode(args[0],ctx);for(i=1;i<args.length;i++)out=rfMul(out,rfFromNode(args[i],ctx),ctx);return out;}
  if(op==="/"&&args.length===2)return rfDiv(rfFromNode(args[0],ctx),rfFromNode(args[1],ctx),ctx);
  if(op==="^"&&args.length===2){exp=integerExponent(args[1]);if(exp!==null)return rfPow(rfFromNode(args[0],ctx),exp,ctx);}
  return atomRF(node,ctx);
}

function trigPairs(ctx){
  var byArg=Object.create(null),pairs=[];
  ctx.atoms.forEach(function(atom,id){
    var m=/^(sin|cos)\((.*)\)$/.exec(atom);if(!m)return;
    if(!byArg[m[2]])byArg[m[2]]={};byArg[m[2]][m[1]]=id;
  });
  Object.keys(byArg).forEach(function(arg){var pair=byArg[arg];if(pair.sin!==undefined&&pair.cos!==undefined)pairs.push([pair.sin,pair.cos]);});
  return pairs;
}
function expandTrigTerm(exps,q,pairs,index,out,ctx){
  for(var i=index||0;i<pairs.length;i++){
    var sinId=pairs[i][0],cosId=pairs[i][1],e=exps[sinId]||0;
    if(e>=2){
      var base=Object.assign(Object.create(null),exps);base[sinId]=e-2;if(base[sinId]===0)delete base[sinId];
      expandTrigTerm(base,q,pairs,i,out,ctx);
      var cosine=Object.assign(Object.create(null),base);cosine[cosId]=(cosine[cosId]||0)+2;
      expandTrigTerm(cosine,qNeg(q),pairs,i,out,ctx);ctx.ops+=2;checkBudget(out,ctx);return;
    }
  }
  addPolyTerm(out,monomialKey(exps),q);
}
function reduceTrigPoly(poly,ctx){
  var pairs=trigPairs(ctx);if(!pairs.length)return poly;
  var out=newPoly(),k;for(k in poly)expandTrigTerm(parseMonomial(k),poly[k],pairs,0,out,ctx);checkBudget(out,ctx);return out;
}
function commonExps(poly){
  var keys=Object.keys(poly);if(!keys.length)return Object.create(null);
  var common=parseMonomial(keys[0]);
  for(var i=1;i<keys.length;i++){
    var cur=parseMonomial(keys[i]);Object.keys(common).forEach(function(id){common[id]=Math.min(common[id],cur[id]||0);if(common[id]===0)delete common[id];});
  }
  return common;
}
function subtractExps(poly,sub){
  if(!Object.keys(sub).length)return poly;
  var out=newPoly(),k;for(k in poly){var e=parseMonomial(k);Object.keys(sub).forEach(function(id){e[id]=(e[id]||0)-sub[id];if(e[id]===0)delete e[id];});out[monomialKey(e)]=cloneQ(poly[k]);}return out;
}
function normalizeRF(rf,ctx){
  rf.n=reduceTrigPoly(rf.n,ctx);rf.d=reduceTrigPoly(rf.d,ctx);
  if(polyZero(rf.n))return {n:newPoly(),d:polyConst(Q(1))};
  var cn=commonExps(rf.n),cd=commonExps(rf.d),cancel=Object.create(null);
  Object.keys(cn).forEach(function(id){if(cd[id])cancel[id]=Math.min(cn[id],cd[id]);});
  rf.n=subtractExps(rf.n,cancel);rf.d=subtractExps(rf.d,cancel);
  var dk=Object.keys(rf.d);
  if(dk.length===1){
    var dq=rf.d[dk[0]];
    if(!qOne(dq)){rf.n=polyScale(rf.n,qDiv(Q(1),dq));rf.d[dk[0]]=Q(1);}
  }
  return rf;
}
function atomFactor(atom){
  if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(atom)||/^[A-Za-z_][A-Za-z0-9_]*\([^()]*\)$/.test(atom))return atom;
  return "("+atom+")";
}
function absQString(q){var n=absBig(q.n);return q.d===1n?String(n):"("+n+"/"+q.d+")";}
function polyToString(poly,ctx){
  var keys=Object.keys(poly);if(!keys.length)return "0";
  keys.sort(function(a,b){
    var ea=parseMonomial(a),eb=parseMonomial(b),da=Object.keys(ea).reduce(function(s,k){return s+ea[k];},0),db=Object.keys(eb).reduce(function(s,k){return s+eb[k];},0);
    return db-da||a.localeCompare(b);
  });
  var out="";
  keys.forEach(function(key,index){
    var q=poly[key],negative=q.n<0n,e=parseMonomial(key),factors=[];
    Object.keys(e).map(Number).sort(function(a,b){return a-b;}).forEach(function(id){var f=atomFactor(ctx.atoms[id]);factors.push(e[id]===1?f:"("+f+")^"+e[id]);});
    var abs=absQString(q),body="";
    if(factors.length){if(abs!=="1")body=abs+"*";body+=factors.join("*");}else body=abs;
    if(index===0)out+=(negative?"-":"")+body;else out+=(negative?" - ":" + ")+body;
  });
  return out;
}
function rfToString(rf,ctx){
  var n=polyToString(rf.n,ctx),d=polyToString(rf.d,ctx);if(d==="1")return n;return "("+n+")/("+d+")";
}
function expressionScore(text){
  var s=String(text),ops=0;try{math.parse(s).traverse(function(node){if(node&&node.isOperatorNode)ops++;});}catch(e){}
  return ops*20+s.replace(/\s+/g,"").length;
}
function trigCleanup(expr){
  try{return math.simplify(expr,[
    "sin(n1)^2 + cos(n1)^2 -> 1","cos(n1)^2 + sin(n1)^2 -> 1",
    "1 - sin(n1)^2 -> cos(n1)^2","1 - cos(n1)^2 -> sin(n1)^2",
    "sin(n1)^2 - 1 -> -cos(n1)^2","cos(n1)^2 - 1 -> -sin(n1)^2"
  ]).toString({parenthesis:"auto"});}catch(e){return raw(expr);}
}
function C(expr){
  var base=S(expr),key=base;if(canonicalCache[key]!==undefined)return canonicalCache[key];
  if(isZero(base)){canonicalCache[key]="0";return "0";}
  if(base.length>9000){var longFallback=S(trigCleanup(base));canonicalCache[key]=longFallback;return longFallback;}
  var best=base,bestScore=expressionScore(base);
  try{
    var cleaned=S(trigCleanup(base));
    var ctx={atomIds:Object.create(null),atoms:[],ops:0,maxOps:60000,maxTerms:5000};
    var rf=normalizeRF(rfFromNode(math.parse(cleaned),ctx),ctx);
    if(polyZero(rf.n)){canonicalCache[key]="0";return "0";}
    var candidate=S(rfToString(rf,ctx)),score=expressionScore(candidate);
    if(score<=bestScore*1.35||candidate.length<base.length){best=candidate;bestScore=score;}
  }catch(e){
    var fallback=S(trigCleanup(base)),fallbackScore=expressionScore(fallback);if(fallbackScore<bestScore)best=fallback;
  }
  canonicalCache[key]=best;canonicalCache[best]=best;return best;
}

var baseInverseMatrix=inverseMatrix;
inverseMatrix=function(matrix){
  var out=baseInverseMatrix(matrix),n=out.matrix.length;out.det=C(out.det);
  for(var i=0;i<n;i++)for(var j=0;j<n;j++)if(!isZero(out.matrix[i][j]))out.matrix[i][j]=C(out.matrix[i][j]);
  return out;
};

christoffel=function(metric,inv,x){
  var n=metric.length,G=[],a,b,c,d;
  for(a=0;a<n;a++){G[a]=[];for(b=0;b<n;b++){G[a][b]=[];for(c=0;c<n;c++){
    var terms=[];for(d=0;d<n;d++){
      var bracket=add(add(D(metric[d][c],x[b]),D(metric[b][d],x[c])),neg(D(metric[b][c],x[d])));
      terms.push(mul(inv[a][d],bracket));
    }
    var value=S(mul("1/2",sum(terms)));G[a][b][c]=isZero(value)?"0":C(value);
  }}}
  return G;
};
christoffelOutput=function(G){
  var out=[],n=G.length;for(var a=0;a<n;a++)for(var b=0;b<n;b++)for(var c=b;c<n;c++){var v=G[a][b][c];if(!isZero(v))out.push({i:a,j:b,k:c,value:v});}return out;
};
geodesicOutput=function(G){
  var n=G.length,out=[];for(var a=0;a<n;a++){var terms=[];for(var b=0;b<n;b++)for(var c=0;c<n;c++)if(!isZero(G[a][b][c]))terms.push(mul(mul(G[a][b][c],"v"+(b+1)),"v"+(c+1)));out.push({i:a,value:terms.length?C(sum(terms)):"0"});}return out;
};
ricciTensor=function(G,x){
  var n=G.length,R=[],s,v,a,l,terms,value,rawValue;for(s=0;s<n;s++)R[s]=new Array(n).fill("0");
  for(s=0;s<n;s++)for(v=s;v<n;v++){
    terms=[];for(a=0;a<n;a++){
      if(!isZero(G[a][v][s]))terms.push(D(G[a][v][s],x[a]));
      if(!isZero(G[a][a][s]))terms.push(neg(D(G[a][a][s],x[v])));
      for(l=0;l<n;l++){
        if(!isZero(G[a][a][l])&&!isZero(G[l][v][s]))terms.push(mul(G[a][a][l],G[l][v][s]));
        if(!isZero(G[a][v][l])&&!isZero(G[l][a][s]))terms.push(neg(mul(G[a][v][l],G[l][a][s])));
      }
    }
    rawValue=terms.length?S(sum(terms)):"0";value=isZero(rawValue)?"0":C(rawValue);R[s][v]=value;R[v][s]=value;
  }return R;
};
ricciScalar=function(ricci,inv){
  var terms=[];for(var i=0;i<ricci.length;i++)for(var j=0;j<ricci.length;j++)if(!isZero(ricci[i][j])&&!isZero(inv[i][j]))terms.push(mul(inv[i][j],ricci[i][j]));return terms.length?C(sum(terms)):"0";
};
einsteinTensor=function(ricci,scalar,metric){
  var n=metric.length,out=[],i,j,value;for(i=0;i<n;i++)out[i]=new Array(n).fill("0");
  if(isZero(scalar)){for(i=0;i<n;i++)for(j=i;j<n;j++){value=C(ricci[i][j]);out[i][j]=value;out[j][i]=value;}return out;}
  for(i=0;i<n;i++)for(j=i;j<n;j++){value=C(sub(ricci[i][j],mul("1/2",mul(scalar,metric[i][j]))));out[i][j]=value;out[j][i]=value;}return out;
};
var baseRiemannOutput=riemannOutput;
riemannOutput=function(G,x){return baseRiemannOutput(G,x).map(function(component){component.value=C(component.value);return component;}).filter(function(component){return !isZero(component.value);});};
var baseOnMessage=onmessage;
onmessage=function(event){canonicalCache=Object.create(null);return baseOnMessage(event);};
