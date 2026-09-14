"use strict";

importScripts("https://cdn.jsdelivr.net/npm/mathjs@11.11.2/lib/browser/math.js");

var simplifyCache = Object.create(null);
var derivativeCache = Object.create(null);

function resetCaches() {
  simplifyCache = Object.create(null);
  derivativeCache = Object.create(null);
}
function raw(expr) { return typeof expr === "string" ? expr : expr.toString(); }
function S(expr) {
  var text = raw(expr);
  if (simplifyCache[text] !== undefined) return simplifyCache[text];
  var value;
  try { value = math.simplify(text).toString({ parenthesis: "auto" }); }
  catch (e) { value = text; }
  simplifyCache[text] = value;
  return value;
}
function D(expr, variable) {
  var text = raw(expr);
  var key = variable + "\u0000" + text;
  if (derivativeCache[key] !== undefined) return derivativeCache[key];
  var value = S(math.derivative(math.parse(text), variable));
  derivativeCache[key] = value;
  return value;
}
function add(a,b){ if(a==="0") return b; if(b==="0") return a; return "("+a+")+("+b+")"; }
function sub(a,b){ if(b==="0") return a; return "("+a+")-("+b+")"; }
function neg(a){ if(a==="0") return "0"; return "-("+a+")"; }
function mul(a,b){ if(a==="0"||b==="0") return "0"; if(a==="1") return b; if(b==="1") return a; if(a==="-1") return neg(b); if(b==="-1") return neg(a); return "("+a+")*("+b+")"; }
function div(a,b){ if(a==="0") return "0"; if(b==="1") return a; return "("+a+")/("+b+")"; }
function sum(items){ var out="0"; for(var i=0;i<items.length;i++) out=add(out,items[i]); return out; }
function isZero(expr){ var v=S(expr).replace(/\s+/g,""); return v==="0"||v==="0.0"||v==="-0"; }
function vars(prefix,n){ var out=[]; for(var i=1;i<=n;i++) out.push(prefix+i); return out; }
function postStep(label){ postMessage({type:"stepStart",label:label}); }
function postComponent(section,label,value,elapsedMs){ postMessage({type:"component",section:section,label:label,value:S(value),elapsedMs:elapsedMs}); }
function postSectionStart(section,title,meta){ postMessage({type:"sectionStart",section:section,title:title,meta:meta||""}); }
function postSectionComplete(section,elapsedMs,summary){ postMessage({type:"sectionComplete",section:section,elapsedMs:elapsedMs,summary:summary||null}); }
function unwrap(node){ while(node&&node.isParenthesisNode) node=node.content; return node; }
function sqrtArgument(node){ node=unwrap(node); if(!node||!node.isFunctionNode||!node.fn||node.fn.name!=="sqrt"||node.args.length!==1) return null; return unwrap(node.args[0]); }
function detectRanders(L,n){
  if(n!==2) return null;
  var root;
  try{ root=unwrap(math.parse(L)); }catch(e){ return null; }
  if(!root||!root.isOperatorNode||root.op!=="^"||root.args.length!==2) return null;
  if(S(root.args[1].toString())!=="2") return null;
  var base=unwrap(root.args[0]);
  if(!base||!base.isOperatorNode||(base.op!=="+"&&base.op!=="-")||base.args.length!==2) return null;
  var left=unwrap(base.args[0]), right=unwrap(base.args[1]);
  var ls=sqrtArgument(left), rs=sqrtArgument(right), ANode, BNode, sign=1;
  if(ls){ ANode=ls; BNode=right; if(base.op==="-") sign=-1; }
  else if(rs&&base.op==="+"){ ANode=rs; BNode=left; }
  else return null;
  var A=ANode.toString({parenthesis:"auto"});
  var B=BNode.toString({parenthesis:"auto"}); if(sign<0) B=neg(B);
  var y=["y1","y2"], a=[["0","0"],["0","0"]], b=["0","0"], i,j,k;
  for(i=0;i<2;i++){
    for(j=0;j<2;j++){
      a[i][j]=S(mul("0.5",D(D(A,y[i]),y[j])));
      for(k=0;k<2;k++) if(!isZero(D(a[i][j],y[k]))) return null;
    }
    b[i]=S(D(B,y[i]));
    for(k=0;k<2;k++) if(!isZero(D(b[i],y[k]))) return null;
  }
  var recA=S(sum([mul(a[0][0],mul("y1","y1")),mul(a[0][1],mul("y1","y2")),mul(a[1][0],mul("y2","y1")),mul(a[1][1],mul("y2","y2"))]));
  if(!isZero(sub(A,recA))) return null;
  var recB=S(add(mul(b[0],"y1"),mul(b[1],"y2")));
  if(!isZero(sub(B,recB))) return null;
  return {A:A,B:B,a:a,b:b};
}
function minor(matrix,row,col){
  var out=[];
  for(var i=0;i<matrix.length;i++){
    if(i===row) continue;
    var line=[];
    for(var j=0;j<matrix.length;j++) if(j!==col) line.push(matrix[i][j]);
    out.push(line);
  }
  return out;
}
function detRaw(matrix){
  var n=matrix.length;
  if(n===1) return matrix[0][0];
  if(n===2) return sub(mul(matrix[0][0],matrix[1][1]),mul(matrix[0][1],matrix[1][0]));
  var terms=[];
  for(var c=0;c<n;c++){
    var t=mul(matrix[0][c],detRaw(minor(matrix,0,c)));
    if(c%2) t=neg(t);
    terms.push(t);
  }
  return sum(terms);
}
function inverseMatrix(matrix){
  var n=matrix.length;
  var det=S(detRaw(matrix));
  if(isZero(det)) throw new Error("The fundamental tensor is degenerate.");
  var inv=[];
  for(var i=0;i<n;i++){
    inv[i]=[];
    for(var j=0;j<n;j++){
      var cof=detRaw(minor(matrix,j,i));
      if((i+j)%2) cof=neg(cof);
      inv[i][j]=S(div(cof,det));
    }
  }
  return {matrix:inv,det:det};
}
function buildRandersMetric(parts){
  var alpha="sqrt("+parts.A+")", F=add(alpha,parts.B), y=["y1","y2"], u=["0","0"], q=["0","0"], g=[["0","0"],["0","0"]];
  for(var i=0;i<2;i++){
    u[i]=S(div(add(mul(parts.a[i][0],y[0]),mul(parts.a[i][1],y[1])),alpha));
    q[i]=S(add(u[i],parts.b[i]));
  }
  for(i=0;i<2;i++) for(var j=0;j<2;j++){
    var angular=div(sub(parts.a[i][j],mul(u[i],u[j])),alpha);
    g[i][j]=S(add(mul(q[i],q[j]),mul(F,angular)));
  }
  return g;
}
function horizontalDerivative(expr,i,x,y,N){
  var terms=[D(expr,x[i])];
  for(var a=0;a<y.length;a++) terms.push(neg(mul(N[a][i],D(expr,y[a]))));
  return S(sum(terms));
}
async function calculate(msg){
  resetCaches();
  var totalStart=performance.now();
  var n=msg.n, L=msg.L, mode=msg.mode;
  math.parse(L);
  var x=vars("x",n), y=vars("y",n);
  var randers=detectRanders(L,n);
  postMessage({type:"path",path:randers?"2D Randers fast path":"general symbolic path"});

  postSectionStart("homogeneity","Geometry check","2-homogeneity");
  var secStart=performance.now();
  postStep("Checking 2-homogeneity");
  var cstart=performance.now(), euler=[];
  for(var a=0;a<n;a++) euler.push(mul(y[a],D(L,y[a])));
  var hom=S(sub(sum(euler),mul("2",L)));
  postComponent("homogeneity","\\sum_i y^i\\bar\\partial_iL-2L",hom,performance.now()-cstart);
  postSectionComplete("homogeneity",performance.now()-secStart,{homogeneous:isZero(hom)});

  postSectionStart("metric","Fundamental tensor","g_{ij}");
  secStart=performance.now();
  var g=[]; for(var i=0;i<n;i++) g[i]=new Array(n).fill("0");
  var j,k,gv;
  if(randers){
    postStep("Building Randers fundamental tensor");
    var rg=buildRandersMetric(randers);
    for(i=0;i<n;i++) for(j=i;j<n;j++){
      cstart=performance.now(); gv=S(rg[i][j]); g[i][j]=gv; g[j][i]=gv;
      postComponent("metric","g_{"+(i+1)+(j+1)+"}",gv,performance.now()-cstart);
    }
  }else{
    for(i=0;i<n;i++) for(j=i;j<n;j++){
      postStep("Computing g_{"+(i+1)+(j+1)+"}"); cstart=performance.now();
      gv=S(mul("0.5",D(D(L,y[i]),y[j]))); g[i][j]=gv; g[j][i]=gv;
      postComponent("metric","g_{"+(i+1)+(j+1)+"}",gv,performance.now()-cstart);
    }
  }
  postSectionComplete("metric",performance.now()-secStart,{matrix:g});

  postSectionStart("inverse","Inverse fundamental tensor","g^{ij} and det(g)");
  secStart=performance.now(); postStep("Inverting the fundamental tensor"); cstart=performance.now();
  var invData=inverseMatrix(g), gInv=invData.matrix, invTotal=performance.now()-cstart;
  for(i=0;i<n;i++) for(j=i;j<n;j++) postComponent("inverse","g^{"+(i+1)+(j+1)+"}",gInv[i][j],invTotal/(n*(n+1)/2));
  postComponent("inverse","\\det(g)",invData.det,0);
  postSectionComplete("inverse",performance.now()-secStart,{matrix:gInv,det:invData.det});

  postSectionStart("classification","Geometry classification","y-dependence of g");
  secStart=performance.now(); var riemannian=true;
  outer: for(i=0;i<n;i++) for(j=0;j<n;j++) for(a=0;a<n;a++){
    postStep("Testing ∂g_{"+(i+1)+(j+1)+"}/∂y"+(a+1)); cstart=performance.now();
    var dep=D(g[i][j],y[a]); if(!isZero(dep)){ riemannian=false; break outer; }
  }
  postComponent("classification","\\text{Riemannian}",riemannian?"1":"0",performance.now()-secStart);
  postSectionComplete("classification",performance.now()-secStart,{riemannian:riemannian,randers:!!randers});

  postSectionStart("cartan","Cartan tensor","C_{ijk}");
  secStart=performance.now();
  if(riemannian){ postComponent("cartan","C_{ijk}","0",0); }
  else{
    for(i=0;i<n;i++) for(j=i;j<n;j++) for(k=j;k<n;k++){
      postStep("Computing C_{"+(i+1)+(j+1)+(k+1)+"}"); cstart=performance.now();
      var cv=S(mul("0.5",D(g[j][k],y[i])));
      postComponent("cartan","C_{"+(i+1)+(j+1)+(k+1)+"}",cv,performance.now()-cstart);
    }
  }
  postSectionComplete("cartan",performance.now()-secStart);

  var G=[], N=[]; for(i=0;i<n;i++) N[i]=new Array(n).fill("0");
  var Gamma=null,B=null,Ch=null,upper,l,m,terms;
  if(riemannian){
    postSectionStart("christoffel","Christoffel symbols","Berwald = Chern–Rund = Levi-Civita");
    secStart=performance.now(); Gamma=[];
    for(upper=0;upper<n;upper++){ Gamma[upper]=[]; for(i=0;i<n;i++) Gamma[upper][i]=new Array(n).fill("0"); }
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
      postStep("Computing Γ^"+(upper+1)+"_{"+(i+1)+(j+1)+"}"); cstart=performance.now(); terms=[];
      for(l=0;l<n;l++){
        var bracket=add(add(D(g[l][j],x[i]),D(g[i][l],x[j])),neg(D(g[i][j],x[l])));
        terms.push(mul(gInv[upper][l],bracket));
      }
      var gam=S(mul("0.5",sum(terms))); Gamma[upper][i][j]=gam; Gamma[upper][j][i]=gam;
      postComponent("christoffel","\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",gam,performance.now()-cstart);
    }
    postSectionComplete("christoffel",performance.now()-secStart);

    postSectionStart("spray","Geodesic spray","G^i"); secStart=performance.now();
    for(upper=0;upper<n;upper++){
      postStep("Computing G^"+(upper+1)); cstart=performance.now(); terms=[];
      for(i=0;i<n;i++) for(j=0;j<n;j++) terms.push(mul(mul(Gamma[upper][i][j],y[i]),y[j]));
      G[upper]=S(sum(terms)); postComponent("spray","G^{"+(upper+1)+"}",G[upper],performance.now()-cstart);
    }
    postSectionComplete("spray",performance.now()-secStart,{vector:G});

    postSectionStart("nonlinear","Nonlinear connection","N^i{}_j"); secStart=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
      postStep("Computing N^"+(upper+1)+"_"+(i+1)); cstart=performance.now(); terms=[];
      for(j=0;j<n;j++) terms.push(mul(Gamma[upper][i][j],y[j]));
      N[upper][i]=S(sum(terms)); postComponent("nonlinear","N^{"+(upper+1)+"}{}_{"+(i+1)+"}",N[upper][i],performance.now()-cstart);
    }
    postSectionComplete("nonlinear",performance.now()-secStart,{matrix:N});
  }else{
    postSectionStart("spray","Geodesic spray","G^i"); secStart=performance.now();
    var dLy=[],dLx=[]; for(i=0;i<n;i++){ dLy[i]=D(L,y[i]); dLx[i]=D(L,x[i]); }
    for(upper=0;upper<n;upper++){
      postStep("Computing G^"+(upper+1)); cstart=performance.now(); terms=[];
      for(k=0;k<n;k++){
        var inner=[]; for(m=0;m<n;m++) inner.push(mul(y[m],D(dLy[k],x[m])));
        terms.push(mul(gInv[upper][k],sub(sum(inner),dLx[k])));
      }
      G[upper]=S(mul("0.5",sum(terms))); postComponent("spray","G^{"+(upper+1)+"}",G[upper],performance.now()-cstart);
    }
    postSectionComplete("spray",performance.now()-secStart,{vector:G});

    postSectionStart("nonlinear","Nonlinear connection","N^i{}_j"); secStart=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
      postStep("Computing N^"+(upper+1)+"_"+(i+1)); cstart=performance.now();
      N[upper][i]=S(mul("0.5",D(G[upper],y[i]))); postComponent("nonlinear","N^{"+(upper+1)+"}{}_{"+(i+1)+"}",N[upper][i],performance.now()-cstart);
    }
    postSectionComplete("nonlinear",performance.now()-secStart,{matrix:N});

    B=[]; Ch=[];
    for(upper=0;upper<n;upper++){ B[upper]=[]; Ch[upper]=[]; for(i=0;i<n;i++){ B[upper][i]=new Array(n).fill("0"); Ch[upper][i]=new Array(n).fill("0"); } }
    postSectionStart("berwald","Berwald Christoffel symbols","{}^B\\Gamma^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
      postStep("Computing Berwald Γ^"+(upper+1)+"_{"+(i+1)+(j+1)+"}"); cstart=performance.now();
      var bv=S(mul("0.5",D(D(G[upper],y[i]),y[j]))); B[upper][i][j]=bv; B[upper][j][i]=bv;
      postComponent("berwald","{}^B\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",bv,performance.now()-cstart);
    }
    postSectionComplete("berwald",performance.now()-secStart);

    postSectionStart("chern","Chern–Rund Christoffel symbols","{}^C\\Gamma^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
      postStep("Computing Chern–Rund Γ^"+(upper+1)+"_{"+(i+1)+(j+1)+"}"); cstart=performance.now(); terms=[];
      for(l=0;l<n;l++){
        var mb=add(add(horizontalDerivative(g[l][j],i,x,y,N),horizontalDerivative(g[i][l],j,x,y,N)),neg(horizontalDerivative(g[i][j],l,x,y,N)));
        terms.push(mul(gInv[upper][l],mb));
      }
      var ch=S(mul("0.5",sum(terms))); Ch[upper][i][j]=ch; Ch[upper][j][i]=ch;
      postComponent("chern","{}^C\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",ch,performance.now()-cstart);
    }
    postSectionComplete("chern",performance.now()-secStart);
  }

  if(mode!=="curvature"){ postMessage({type:"done",totalMs:performance.now()-totalStart}); return; }

  var R=[];
  if(riemannian){
    postSectionStart("affineCurvature","Affine curvature","\\bar R^k{}_{lij}"); secStart=performance.now();
    var AR=[]; for(upper=0;upper<n;upper++){ AR[upper]=[]; for(l=0;l<n;l++){ AR[upper][l]=[]; for(i=0;i<n;i++) AR[upper][l][i]=new Array(n).fill("0"); } }
    for(upper=0;upper<n;upper++) for(l=0;l<n;l++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      postStep("Computing R̄^"+(upper+1)+"_"+(l+1)+(i+1)+(j+1)); cstart=performance.now();
      terms=[D(Gamma[upper][j][l],x[i]),neg(D(Gamma[upper][i][l],x[j]))];
      for(m=0;m<n;m++){ terms.push(mul(Gamma[upper][i][m],Gamma[m][j][l])); terms.push(neg(mul(Gamma[upper][j][m],Gamma[m][i][l]))); }
      var arv=S(sum(terms)); AR[upper][l][i][j]=arv; AR[upper][l][j][i]=neg(arv);
      postComponent("affineCurvature","\\bar R^{"+(upper+1)+"}{}_{"+(l+1)+(i+1)+(j+1)+"}",arv,performance.now()-cstart);
    }
    postSectionComplete("affineCurvature",performance.now()-secStart);

    postSectionStart("affineRicci","Affine Ricci tensor","\\bar R_{ij}"); secStart=performance.now();
    var aRic=[]; for(i=0;i<n;i++) aRic[i]=new Array(n).fill("0");
    for(l=0;l<n;l++) for(j=0;j<n;j++){
      postStep("Computing R̄_"+(l+1)+(j+1)); cstart=performance.now(); terms=[]; for(i=0;i<n;i++) terms.push(AR[i][l][i][j]);
      aRic[l][j]=S(sum(terms)); postComponent("affineRicci","\\bar R_{"+(l+1)+(j+1)+"}",aRic[l][j],performance.now()-cstart);
    }
    postSectionComplete("affineRicci",performance.now()-secStart,{matrix:aRic});

    postSectionStart("curvature","Nonlinear curvature","R^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++){ R[upper]=[]; for(i=0;i<n;i++) R[upper][i]=new Array(n).fill("0"); }
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      postStep("Computing R^"+(upper+1)+"_"+(i+1)+(j+1)); cstart=performance.now(); terms=[]; for(l=0;l<n;l++) terms.push(mul(AR[upper][l][i][j],y[l]));
      var rv=S(sum(terms)); R[upper][i][j]=rv; R[upper][j][i]=neg(rv);
      postComponent("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv,performance.now()-cstart);
    }
    postSectionComplete("curvature",performance.now()-secStart);
  }else{
    postSectionStart("curvature","Nonlinear curvature","R^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++){ R[upper]=[]; for(i=0;i<n;i++) R[upper][i]=new Array(n).fill("0"); }
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      postStep("Computing R^"+(upper+1)+"_"+(i+1)+(j+1)); cstart=performance.now();
      rv=S(sub(horizontalDerivative(N[upper][j],i,x,y,N),horizontalDerivative(N[upper][i],j,x,y,N)));
      R[upper][i][j]=rv; R[upper][j][i]=neg(rv);
      postComponent("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv,performance.now()-cstart);
    }
    postSectionComplete("curvature",performance.now()-secStart);
  }

  postSectionStart("deviation","Geodesic deviation tensor","R^k{}_i"); secStart=performance.now();
  var dev=[]; for(upper=0;upper<n;upper++) dev[upper]=new Array(n).fill("0");
  for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
    postStep("Computing R^"+(upper+1)+"_"+(i+1)); cstart=performance.now(); terms=[]; for(j=0;j<n;j++) terms.push(mul(R[upper][i][j],y[j]));
    dev[upper][i]=S(sum(terms)); postComponent("deviation","R^{"+(upper+1)+"}{}_{"+(i+1)+"}",dev[upper][i],performance.now()-cstart);
  }
  postSectionComplete("deviation",performance.now()-secStart,{matrix:dev});

  postSectionStart("ricci","Finsler-Ricci quantities","Ric and R_{ij}"); secStart=performance.now();
  postStep("Computing Ric"); cstart=performance.now(); terms=[]; for(i=0;i<n;i++) for(j=0;j<n;j++) terms.push(mul(R[i][i][j],y[j]));
  var Ric=S(sum(terms)); postComponent("ricci","\\mathrm{Ric}",Ric,performance.now()-cstart);
  var Ricci=[]; for(i=0;i<n;i++) Ricci[i]=new Array(n).fill("0");
  for(i=0;i<n;i++) for(j=i;j<n;j++){
    postStep("Computing R_"+(i+1)+(j+1)); cstart=performance.now();
    var rij=S(mul("0.5",D(D(Ric,y[i]),y[j]))); Ricci[i][j]=rij; Ricci[j][i]=rij;
    postComponent("ricci","R_{"+(i+1)+(j+1)+"}",rij,performance.now()-cstart);
  }
  postSectionComplete("ricci",performance.now()-secStart,{matrix:Ricci});
  postMessage({type:"done",totalMs:performance.now()-totalStart});
}
onmessage=function(event){ if(!event.data||event.data.type!=="calculate") return; calculate(event.data).catch(function(error){ postMessage({type:"error",message:error&&error.message?error.message:String(error)}); }); };
