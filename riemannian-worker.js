"use strict";

importScripts("https://cdn.jsdelivr.net/npm/mathjs@11.11.2/lib/browser/math.js");

var simplifyCache=Object.create(null),finalSimplifyCache=Object.create(null),derivativeCache=Object.create(null),functionInfo=Object.create(null),baseByKey=Object.create(null);

function raw(expr){return typeof expr==="string"?expr:expr.toString({parenthesis:"auto"});}
function S(expr){
  var text=raw(expr);if(simplifyCache[text]!==undefined)return simplifyCache[text];
  var out=text;try{out=math.simplify(text,{}, {exactFractions:true}).toString({parenthesis:"auto"});}catch(e){try{out=math.simplify(text).toString({parenthesis:"auto"});}catch(e2){}}
  simplifyCache[text]=out;simplifyCache[out]=out;return out;
}
function expressionCost(expr){
  var text=raw(expr),ops=0;try{math.parse(text).traverse(function(node){if(node&&node.isOperatorNode)ops++;});}catch(e){}return ops*24+text.replace(/\s+/g,"").length;
}
function rationalizeAtomic(expr){
  var node=math.parse(raw(expr)),held=[],prefix="__heldfn";
  node=node.transform(function(child){if(child&&child.isFunctionNode){var token=prefix+held.length;held.push(child);return math.parse(token);}return child;});
  var candidate=math.rationalize(node);
  candidate=candidate.transform(function(child){if(child&&child.isSymbolNode&&child.name.indexOf(prefix)===0){var i=Number(child.name.slice(prefix.length));if(Number.isInteger(i)&&held[i])return held[i];}return child;});
  return candidate;
}
function F(expr){
  var base=S(expr),key=raw(base);if(finalSimplifyCache[key]!==undefined)return finalSimplifyCache[key];
  var best=base,bestCost=expressionCost(base);
  try{
    var candidate=rationalizeAtomic(base);
    candidate=math.simplify(candidate,{}, {exactFractions:true}).toString({parenthesis:"auto"});
    var cost=expressionCost(candidate);if(cost<bestCost){best=candidate;bestCost=cost;}
  }catch(e){}
  try{
    var factored=math.simplify(best,["n1*n3 + n2*n3 -> (n1+n2)*n3","n3*n1 + n3*n2 -> n3*(n1+n2)"]).toString({parenthesis:"auto"});
    factored=S(factored);var factorCost=expressionCost(factored);if(factorCost<bestCost){best=factored;bestCost=factorCost;}
  }catch(e2){}
  finalSimplifyCache[key]=best;finalSimplifyCache[best]=best;return best;
}
function isZero(expr){var s=S(expr).replace(/\s+/g,"");return s==="0"||s==="0.0"||s==="-0";}
function add(a,b){if(a==="0")return b;if(b==="0")return a;return "("+a+")+("+b+")";}
function sub(a,b){if(b==="0")return a;return "("+a+")-("+b+")";}
function mul(a,b){if(a==="0"||b==="0")return "0";if(a==="1")return b;if(b==="1")return a;return "("+a+")*("+b+")";}
function div(a,b){if(a==="0")return "0";if(b==="1")return a;return "("+a+")/("+b+")";}
function neg(a){return a==="0"?"0":"-("+a+")";}
function sum(items){var out="0";for(var i=0;i<items.length;i++)out=add(out,items[i]);return out;}
function vars(prefix,n){var out=[];for(var i=1;i<=n;i++)out.push(prefix+i);return out;}
function symbolNode(variable){var n=math.parse(String(variable));if(!n||!n.isSymbolNode)throw new Error("Invalid differentiation variable: "+variable);return n;}
function nativeD(expr,variable){var key="native\u0000"+variable+"\u0000"+raw(expr);if(derivativeCache[key]!==undefined)return derivativeCache[key];var out=S(math.derivative(math.parse(raw(expr)),symbolNode(variable)));derivativeCache[key]=out;return out;}
function resetFunctions(defs){
  functionInfo=Object.create(null);baseByKey=Object.create(null);
  (defs||[]).forEach(function(def){var info={token:def.token,baseToken:def.token,name:def.name,args:(def.args||[]).slice(),multi:[],argLabels:(def.argLabels||[]).slice()};functionInfo[info.token]=info;baseByKey[info.name+"\u0000"+info.args.join("\u0001")]=info;});
}
function collectFunctionSymbols(node){var found=Object.create(null),out=[];node.traverse(function(child){if(child&&child.isSymbolNode&&functionInfo[child.name]&&!found[child.name]){found[child.name]=1;out.push(child.name);}});return out;}
function derivativeToken(info,argIndex){var multi=info.multi.slice();multi.push(argIndex+1);multi.sort(function(a,b){return a-b;});var token=info.baseToken+"_d"+multi.join("_");if(!functionInfo[token])functionInfo[token]={token:token,baseToken:info.baseToken,name:info.name,args:info.args.slice(),multi:multi,argLabels:info.argLabels.slice()};return token;}
function tokenDerivative(info,variable){var terms=[];for(var j=0;j<info.args.length;j++){var da=nativeD(info.args[j],variable);if(isZero(da))continue;terms.push(mul(derivativeToken(info,j),da));}return terms.length?S(sum(terms)):"0";}
function D(expr,variable){
  var text=raw(expr),key="custom\u0000"+variable+"\u0000"+text;if(derivativeCache[key]!==undefined)return derivativeCache[key];
  if(!Object.keys(functionInfo).length){var nd=nativeD(text,variable);derivativeCache[key]=nd;return nd;}
  var node=math.parse(text),pieces=[];
  try{pieces.push(math.derivative(node,symbolNode(variable),{simplify:false}).toString({parenthesis:"auto"}));}catch(e){pieces.push(math.derivative(node,symbolNode(variable)).toString({parenthesis:"auto"}));}
  var symbols=collectFunctionSymbols(node);
  for(var s=0;s<symbols.length;s++){
    var token=symbols[s],partial;
    try{partial=math.derivative(node,symbolNode(token),{simplify:false}).toString({parenthesis:"auto"});}catch(e2){partial=math.derivative(node,symbolNode(token)).toString({parenthesis:"auto"});}
    if(isZero(partial))continue;var dt=tokenDerivative(functionInfo[token],variable);if(isZero(dt))continue;pieces.push(mul(partial,dt));
  }
  var out=S(sum(pieces));derivativeCache[key]=out;return out;
}

function minor(matrix,row,col){var out=[];for(var i=0;i<matrix.length;i++){if(i===row)continue;var line=[];for(var j=0;j<matrix.length;j++)if(j!==col)line.push(matrix[i][j]);out.push(line);}return out;}
function detRaw(matrix){var n=matrix.length;if(n===1)return matrix[0][0];if(n===2)return sub(mul(matrix[0][0],matrix[1][1]),mul(matrix[0][1],matrix[1][0]));var terms=[];for(var c=0;c<n;c++){var term=mul(matrix[0][c],detRaw(minor(matrix,0,c)));if(c%2)term=neg(term);terms.push(term);}return sum(terms);}
function inverseMatrix(matrix){
  var n=matrix.length,diagonal=true,i,j;for(i=0;i<n&&diagonal;i++)for(j=0;j<n;j++)if(i!==j&&!isZero(matrix[i][j])){diagonal=false;break;}
  if(diagonal){var dinv=[],factors=[];for(i=0;i<n;i++){dinv[i]=new Array(n).fill("0");var d=S(matrix[i][i]);if(isZero(d))throw new Error("The metric is degenerate.");dinv[i][i]=S(div("1",d));factors.push(d);}return {matrix:dinv,det:S(factors.reduce(function(a,b){return mul(a,b);},"1"))};}
  var det=S(detRaw(matrix));if(isZero(det))throw new Error("The metric is degenerate.");var inv=[];
  for(i=0;i<n;i++){inv[i]=[];for(j=0;j<n;j++){var cof=detRaw(minor(matrix,j,i));if((i+j)%2)cof=neg(cof);inv[i][j]=S(div(cof,det));}}
  return {matrix:inv,det:det};
}

function postProgress(label,detail){postMessage({type:"progress",label:label,detail:detail||""});}
function validateMetric(metric){for(var i=0;i<metric.length;i++)for(var j=0;j<metric.length;j++){try{math.parse(metric[i][j]);}catch(e){throw new Error("Could not parse metric entry g"+(i+1)+(j+1)+": "+e.message);}}}

function christoffel(metric,inv,x){
  var n=metric.length,G=[],a,b,c,d;
  for(a=0;a<n;a++){G[a]=[];for(b=0;b<n;b++){G[a][b]=[];for(c=0;c<n;c++){var terms=[];for(d=0;d<n;d++){var bracket=add(add(D(metric[d][c],x[b]),D(metric[b][d],x[c])),neg(D(metric[b][c],x[d])));terms.push(mul(inv[a][d],bracket));}G[a][b][c]=S(mul("1/2",sum(terms)));}}}
  return G;
}

function christoffelOutput(G){var out=[],n=G.length;for(var a=0;a<n;a++)for(var b=0;b<n;b++)for(var c=b;c<n;c++){var v=S(G[a][b][c]);if(!isZero(v))out.push({i:a,j:b,k:c,value:v});}return out;}

function geodesicOutput(G){
  var n=G.length,out=[];for(var a=0;a<n;a++){var terms=[];for(var b=0;b<n;b++)for(var c=0;c<n;c++)terms.push(mul(mul(G[a][b][c],"v"+(b+1)),"v"+(c+1)));out.push({i:a,value:S(sum(terms))});}return out;
}

function ricciTensor(G,x){
  var n=G.length,R=[],s,v,a,l,terms;
  for(s=0;s<n;s++){R[s]=[];for(v=0;v<n;v++){
    terms=[];
    for(a=0;a<n;a++){
      terms.push(D(G[a][v][s],x[a]));
      terms.push(neg(D(G[a][a][s],x[v])));
      for(l=0;l<n;l++){
        terms.push(mul(G[a][a][l],G[l][v][s]));
        terms.push(neg(mul(G[a][v][l],G[l][a][s])));
      }
    }
    R[s][v]=F(sum(terms));
  }}
  return R;
}

function ricciScalar(ricci,inv){var terms=[];for(var i=0;i<ricci.length;i++)for(var j=0;j<ricci.length;j++)terms.push(mul(inv[i][j],ricci[i][j]));return F(sum(terms));}
function einsteinTensor(ricci,scalar,metric){var out=[];for(var i=0;i<metric.length;i++){out[i]=[];for(var j=0;j<metric.length;j++)out[i][j]=F(sub(ricci[i][j],mul("1/2",mul(scalar,metric[i][j]))));}return out;}

function riemannOutput(G,x){
  var n=G.length,out=[],total=n*n*n*(n-1)/2,count=0;
  for(var r=0;r<n;r++)for(var s=0;s<n;s++)for(var m=0;m<n;m++)for(var v=m+1;v<n;v++){
    var terms=[D(G[r][v][s],x[m]),neg(D(G[r][m][s],x[v]))];
    for(var l=0;l<n;l++){terms.push(mul(G[r][m][l],G[l][v][s]));terms.push(neg(mul(G[r][v][l],G[l][m][s])));}
    var value=S(sum(terms));if(!isZero(value))out.push({i:r,j:s,k:m,l:v,value:value});
    count++;if(count%12===0)postProgress("Computing Riemann tensor",count+" / "+total+" independent slots");
  }
  return out;
}

onmessage=function(event){
  var data=event.data||{};if(data.type!=="calculate")return;var started=performance.now();
  try{
    simplifyCache=Object.create(null);finalSimplifyCache=Object.create(null);derivativeCache=Object.create(null);resetFunctions(data.symbolicFunctions||[]);
    var n=Number(data.n),metric=data.metric,outputs=data.outputs||{},x=vars("x",n),result={};
    if(!Array.isArray(metric)||metric.length!==n)throw new Error("Metric dimension does not match the selected dimension.");validateMetric(metric);
    if(outputs.metric)result.metric=metric.map(function(r){return r.map(S);});
    var needConnection=outputs.christoffel||outputs.geodesic||outputs.riemann||outputs.ricci||outputs.scalar||outputs.einstein;
    var needInverse=outputs.inverse||needConnection;
    var invData=null,G=null,ricci=null,scalar=null;
    if(needInverse){postProgress("Inverting metric");invData=inverseMatrix(metric);if(outputs.inverse)result.inverse=invData;}
    if(needConnection){postProgress("Computing Levi-Civita connection");G=christoffel(metric,invData.matrix,x);if(outputs.christoffel)result.christoffel=christoffelOutput(G);}
    if(outputs.geodesic){postProgress("Building geodesic equations");result.geodesic=geodesicOutput(G);}
    if(outputs.ricci||outputs.scalar||outputs.einstein){postProgress("Computing Ricci tensor directly","without materializing full Riemann tensor");ricci=ricciTensor(G,x);if(outputs.ricci)result.ricci=ricci;}
    if(outputs.scalar||outputs.einstein){postProgress("Contracting Ricci scalar");scalar=ricciScalar(ricci,invData.matrix);if(outputs.scalar)result.scalar=scalar;}
    if(outputs.einstein){postProgress("Building Einstein tensor");result.einstein=einsteinTensor(ricci,scalar,metric);}
    if(outputs.riemann){postProgress("Computing Riemann tensor","explicit output requested");result.riemann=riemannOutput(G,x);}
    postMessage({type:"result",result:result});postMessage({type:"done",elapsedMs:performance.now()-started});
  }catch(error){postMessage({type:"error",message:error&&error.message?error.message:String(error)});}
};

/* Exact rational curvature canonicalization. */
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

/* Final exact factor and display canonicalization. */
function copyPoly(poly){
  var out=newPoly(),key;for(key in poly)out[key]=cloneQ(poly[key]);return out;
}
function monomialDegree(key){
  var exps=parseMonomial(key),sum=0,id;for(id in exps)sum+=exps[id];return sum;
}
function compareMonomialKeys(a,b){
  var da=monomialDegree(a),db=monomialDegree(b);if(da!==db)return da-db;
  var ea=parseMonomial(a),eb=parseMonomial(b),ids=Object.create(null),id;
  for(id in ea)ids[id]=1;for(id in eb)ids[id]=1;
  var ordered=Object.keys(ids).map(Number).sort(function(x,y){return x-y;});
  for(var i=0;i<ordered.length;i++){
    id=ordered[i];var diff=(ea[id]||0)-(eb[id]||0);if(diff)return diff;
  }
  return 0;
}
function leadingKey(poly){
  var keys=Object.keys(poly);if(!keys.length)return null;
  var best=keys[0];for(var i=1;i<keys.length;i++)if(compareMonomialKeys(keys[i],best)>0)best=keys[i];return best;
}
function divideMonomialKeys(dividend,divisor){
  var a=parseMonomial(dividend),b=parseMonomial(divisor),out=Object.create(null),id;
  for(id in b)if((a[id]||0)<b[id])return null;
  for(id in a){var e=a[id]-(b[id]||0);if(e)out[id]=e;}
  return monomialKey(out);
}
function polyDivExact(dividend,divisor,ctx){
  if(polyZero(divisor))return null;
  var remainder=copyPoly(dividend),quotient=newPoly(),leadD=leadingKey(divisor),steps=0;
  while(!polyZero(remainder)){
    if(++steps>256)return null;
    var leadR=leadingKey(remainder),qKey=divideMonomialKeys(leadR,leadD);if(qKey===null)return null;
    var qCoeff=qDiv(remainder[leadR],divisor[leadD]);addPolyTerm(quotient,qKey,qCoeff);
    for(var dk in divisor){
      ctx.ops++;addPolyTerm(remainder,multiplyKeys(qKey,dk),qNeg(qMul(qCoeff,divisor[dk])));
    }
    checkBudget(remainder,ctx);checkBudget(quotient,ctx);
  }
  return quotient;
}
function lcmBig(a,b){a=absBig(a);b=absBig(b);if(a===0n||b===0n)return 0n;return a/gcdBig(a,b)*b;}
function coefficientContent(poly){
  var keys=Object.keys(poly);if(!keys.length)return Q(1);
  var gn=0n,ld=1n;
  keys.forEach(function(key){var q=poly[key];gn=gn===0n?absBig(q.n):gcdBig(gn,q.n);ld=lcmBig(ld,q.d);});
  return Q(gn||1n,ld||1n);
}
function primitiveResidual(poly){
  if(polyZero(poly))return null;
  var exps=commonExps(poly),content=coefficientContent(poly),res=subtractExps(poly,exps);
  res=polyScale(res,qDiv(Q(1),content));
  return {poly:res,exps:exps,content:content};
}
function halfMonomialKey(key){
  var exps=parseMonomial(key),out=Object.create(null),id;
  for(id in exps){if(exps[id]%2!==0)return null;if(exps[id])out[id]=exps[id]/2;}
  return monomialKey(out);
}
function perfectSquareBinomialFactor(poly){
  var keys=Object.keys(poly);if(keys.length!==3)return null;
  for(var m=0;m<keys.length;m++){
    var middle=poly[keys[m]];
    if(middle.d!==1n||absBig(middle.n)!==2n)continue;
    var outer=keys.filter(function(_,i){return i!==m;}),qa=poly[outer[0]],qb=poly[outer[1]];
    if(qa.d!==1n||qb.d!==1n||absBig(qa.n)!==1n||qb.n!==qa.n)continue;
    var sa=halfMonomialKey(outer[0]),sb=halfMonomialKey(outer[1]);
    if(sa===null||sb===null||multiplyKeys(sa,sb)!==keys[m])continue;
    var relative=middle.n===2n*qa.n?1:(middle.n===-2n*qa.n?-1:0);if(!relative)continue;
    var factor=newPoly();addPolyTerm(factor,sa,Q(1));addPolyTerm(factor,sb,Q(relative));return factor;
  }
  return null;
}
function nonConstantFactor(poly){
  var residual=primitiveResidual(poly);if(!residual)return null;
  var keys=Object.keys(residual.poly);
  if(keys.length===2){if(keys.every(function(k){return k==="";}))return null;return residual.poly;}
  return perfectSquareBinomialFactor(residual.poly);
}
function cancelFactor(rf,factor,ctx){
  if(!factor)return false;
  var qn=polyDivExact(rf.n,factor,ctx);if(!qn)return false;
  var qd=polyDivExact(rf.d,factor,ctx);if(!qd)return false;
  rf.n=qn;rf.d=qd;return true;
}

var baseNormalizeRF=normalizeRF;
normalizeRF=function(rf,ctx){
  rf=baseNormalizeRF(rf,ctx);
  if(polyZero(rf.n))return rf;

  var whole=polyDivExact(rf.n,rf.d,ctx);
  if(whole){rf.n=whole;rf.d=polyConst(Q(1));return rf;}

  for(var round=0;round<4;round++){
    var changed=false;
    changed=cancelFactor(rf,nonConstantFactor(rf.n),ctx)||changed;
    if(!changed)changed=cancelFactor(rf,nonConstantFactor(rf.d),ctx)||changed;
    if(!changed)break;
    rf=baseNormalizeRF(rf,ctx);
    if(polyZero(rf.n))return rf;
    whole=polyDivExact(rf.n,rf.d,ctx);
    if(whole){rf.n=whole;rf.d=polyConst(Q(1));return rf;}
  }
  return rf;
};

function commonMonomialString(exps,ctx){
  var ids=Object.keys(exps).map(Number).sort(function(a,b){return a-b;}),parts=[];
  ids.forEach(function(id){var atom=atomFactor(ctx.atoms[id]),e=exps[id];parts.push(e===1?atom:"("+atom+")^"+e);});
  return parts.join("*");
}

function singleLinearAtom(key){
  var exps=parseMonomial(key),ids=Object.keys(exps);
  if(ids.length!==1)return null;
  var id=Number(ids[0]);
  return exps[id]===1?id:null;
}
function preferredLinearBinomial(poly,ctx){
  var keys=Object.keys(poly);
  if(keys.length!==2)return null;
  var aId=singleLinearAtom(keys[0]),bId=singleLinearAtom(keys[1]);
  if(aId===null||bId===null)return null;
  var a=poly[keys[0]],b=poly[keys[1]];
  if(a.d!==1n||b.d!==1n||absBig(a.n)!==1n||absBig(b.n)!==1n||a.n===b.n)return null;
  var aCoord=/^x\d+$/.test(ctx.atoms[aId]),bCoord=/^x\d+$/.test(ctx.atoms[bId]);
  if(aCoord===bCoord)return null;
  var coordId=aCoord?aId:bId,paramId=aCoord?bId:aId;
  var coordQ=aCoord?a:b;
  return {sign:coordQ.n>0n?1:-1,text:atomFactor(ctx.atoms[coordId])+" - "+atomFactor(ctx.atoms[paramId])};
}
function presentationPolyData(poly,ctx){
  if(polyZero(poly))return {sign:1,content:Q(0),factors:["0"]};
  var info=primitiveResidual(poly),res=info.poly,sign=1,factors=[];
  var preferred=preferredLinearBinomial(res,ctx);
  if(preferred){sign=preferred.sign;}
  else{var lead=leadingKey(res);if(lead!==null&&res[lead]&&res[lead].n<0n){res=polyScale(res,Q(-1));sign=-1;}}
  var monomial=commonMonomialString(info.exps,ctx);if(monomial)factors.push(monomial);
  if(preferred){factors.push("("+preferred.text+")");}
  else{
    var residual=polyToString(res,ctx),residualKeys=Object.keys(res);
    if(residual==="-1")sign*=-1;
    else if(residual!=="1")factors.push(residualKeys.length>1?"("+residual+")":residual);
  }
  return {sign:sign,content:info.content,factors:factors};
}
function partsProduct(parts){return parts.length?parts.join("*"):"1";}
rfToString=function(rf,ctx){
  var n=presentationPolyData(rf.n,ctx),d=presentationPolyData(rf.d,ctx);
  if(n.content.n===0n)return "0";
  var coefficient=qDiv(n.content,d.content),numerator=n.factors.slice(),denominator=d.factors.slice();
  var coeffNumerator=absBig(coefficient.n),coeffDenominator=coefficient.d;
  if(coeffNumerator!==1n)numerator.unshift(String(coeffNumerator));
  if(coeffDenominator!==1n)denominator.unshift(String(coeffDenominator));
  var sign=n.sign*d.sign*(coefficient.n<0n?-1:1),num=partsProduct(numerator),den=partsProduct(denominator);
  if(sign<0)num="-"+num;
  if(den==="1")return num;
  return "("+num+")/("+den+")";
};

function presentationExpression(expr){
  var cleaned=S(trigCleanup(expr));
  try{
    var ctx={atomIds:Object.create(null),atoms:[],ops:0,maxOps:60000,maxTerms:5000};
    var rf=normalizeRF(rfFromNode(math.parse(cleaned),ctx),ctx);
    if(polyZero(rf.n))return "0";
    return rfToString(rf,ctx);
  }catch(e){return cleaned;}
}
var calculationChristoffelOutput=christoffelOutput;
christoffelOutput=function(G){
  return calculationChristoffelOutput(G).map(function(component){component.value=presentationExpression(component.value);return component;});
};
function presentationMatrix(matrix){return matrix.map(function(row){return row.map(presentationExpression);});}

var nativePostMessage=self.postMessage.bind(self);
self.postMessage=function(message,transfer){
  if(message&&message.type==="result"&&message.result){
    var result=message.result;
    if(result.inverse){var inverse=result.inverse;result.inverse={matrix:presentationMatrix(inverse.matrix),det:presentationExpression(inverse.det)};}
    if(result.ricci)result.ricci=presentationMatrix(result.ricci);
    if(result.scalar!==undefined)result.scalar=presentationExpression(result.scalar);
    if(result.einstein)result.einstein=presentationMatrix(result.einstein);
  }
  if(arguments.length>1)return nativePostMessage(message,transfer);
  return nativePostMessage(message);
};

/* Generic disconnected-block inverse fast path. */
(function(){
  var generalInverseMatrix=inverseMatrix;

  function connectedBlocks(matrix){
    var n=matrix.length,seen=new Array(n).fill(false),blocks=[];
    for(var start=0;start<n;start++){
      if(seen[start])continue;
      var stack=[start],block=[];seen[start]=true;
      while(stack.length){
        var i=stack.pop();block.push(i);
        for(var j=0;j<n;j++){
          if(seen[j]||i===j
continue;
          if(!isZero(matrix[i][j])||!isZero(matrix[j][i])){seen[j]=true;stack.push(j);}
        }
      }
      block.sort(function(a,b){return a-b;});blocks.push(block)g;
    }
    return blocks;
  }

  inverseMatrix=function(matrix){
    var n=matrix.length,blocks=connectedBlocks(matrix);
    if(blocks.length===1)return generalInverseMatrix(matrix);

    var inv=[],detFactors=[];
    for(var i=0;i<n;i++)inv[i]=new Array(n).fill("0");

    for(var b=0;b<blocks.length;b++){
      var indices=blocks[b];
      if(indices.length===1){
        var p=indices[0],d=S(matrix[p][p]);
        if(isZero(d))throw new Error("The metric is degenerate.");
        inv[p][p]=S(div("1",d));detFactors.push(d);continue;
      }

      if(indices.length===2){
        var p0=indices[0],p1=indices[1];
        var a=S(matrix[p0][p0]),bb=S(matrix[p0][p1]),c=S(matrix[p1][p0]),d2=S(matrix[p1][p1]);
        var det2=S(sub(mul(a,d2),mul(bb,c)));
        if(isZero(det2))throw new Error("The metric is degenerate.");
        inv[p0][p0]=S(div(d2,det2));
        inv[p0][p1]=S(div(neg(bb),det2));
        inv[p1][p0]=S(div(neg(c),det2));
        inv[p1][p1]=S(div(a,det2));
        detFactors.push(det2);continue;
      }

      var submatrix=[];
      for(var r = 0;r < indices.length;r++){
        submatrix[r]=[];
        for(var cidx=0;cidx<indices.length;cidx++)submatrix[r][cidx]=matrix[indices[r]][indices[cidx]];
      }
      var subInverse=generalInverseMatrix(submatrix);detFactors.push(subInverse.det);
      for(var r2=0;r2<indices.length;r2++)for(var c2=0;c2<indices.length;c2++)inv[indices[r2]][indices[c2]]=subInverse.matrix[r2][c2];
    }

    return {matrix:inv,det:S(detFactors.reduce(function(a,b){return mul(a,b);},"1"))};
  };
})();
