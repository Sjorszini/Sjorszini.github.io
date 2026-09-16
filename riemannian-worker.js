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