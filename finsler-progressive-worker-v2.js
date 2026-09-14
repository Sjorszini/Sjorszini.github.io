"use strict";

importScripts("https://cdn.jsdelivr.net/npm/mathjs@11.11.2/lib/browser/math.js");

var simplifyCache = Object.create(null);
var derivativeCache = Object.create(null);
var activeOutputs = Object.create(null);

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
function pow(a,p){ return "("+a+")^("+p+")"; }
function sum(items){ var out="0"; for(var i=0;i<items.length;i++) out=add(out,items[i]); return out; }
function isZero(expr){ var v=S(expr).replace(/\s+/g,""); return v==="0"||v==="0.0"||v==="-0"; }
function vars(prefix,n){ var out=[]; for(var i=1;i<=n;i++) out.push(prefix+i); return out; }
function want(key){ return activeOutputs[key] !== false; }
function sectionKey(section){
  var map={metric:"metric",inverse:"inverse",cartan:"cartan",spray:"spray",nonlinear:"nonlinear",christoffel:"connections",berwald:"connections",chern:"connections",curvature:"curvature",deviation:"deviation",ricci:"ricci",affineCurvature:"affine",affineRicci:"affine"};
  return map[section]||section;
}
function shouldPost(section){ return want(sectionKey(section)); }
function postStep(label){ postMessage({type:"stepStart",label:label}); }
function postComponent(section,label,value,elapsedMs){ if(shouldPost(section)) postMessage({type:"component",section:section,label:label,value:S(value),elapsedMs:elapsedMs}); }
function postSectionStart(section,title,meta){ if(shouldPost(section)) postMessage({type:"sectionStart",section:section,title:title,meta:meta||""}); }
function postSectionComplete(section,elapsedMs,summary){ if(shouldPost(section)) postMessage({type:"sectionComplete",section:section,elapsedMs:elapsedMs,summary:summary||null}); }
function unwrap(node){ while(node&&node.isParenthesisNode) node=node.content; return node; }
function sqrtArgument(node){ node=unwrap(node); if(!node||!node.isFunctionNode||!node.fn||node.fn.name!=="sqrt"||node.args.length!==1) return null; return unwrap(node.args[0]); }

function parseMetricMatrix(text,n,y) {
  var node=unwrap(math.parse(text));
  if(!node||!node.isArrayNode||node.items.length!==n) throw new Error("Enter the metric as an "+n+"×"+n+" matrix, for example [[g11,g12],[g21,g22]].");
  var g=[],i,j,a;
  for(i=0;i<n;i++){
    var row=unwrap(node.items[i]);
    if(!row||!row.isArrayNode||row.items.length!==n) throw new Error("Every metric row must contain exactly "+n+" entries.");
    g[i]=[];
    for(j=0;j<n;j++){
      g[i][j]=S(row.items[j].toString({parenthesis:"auto"}));
      for(a=0;a<y.length;a++) if(!isZero(D(g[i][j],y[a]))) throw new Error("Pseudo-Riemannian metric entries may depend on x, but not on y.");
    }
  }
  for(i=0;i<n;i++) for(j=i+1;j<n;j++) if(!isZero(sub(g[i][j],g[j][i]))) throw new Error("The metric matrix must be symmetric: g"+(i+1)+(j+1)+" ≠ g"+(j+1)+(i+1)+".");
  return g;
}

function detectRanders(L,n){
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
  var y=vars("y",n), a=[], b=[], i,j,k;
  for(i=0;i<n;i++){
    a[i]=[];
    for(j=0;j<n;j++){
      a[i][j]=S(mul("0.5",D(D(A,y[i]),y[j])));
      for(k=0;k<n;k++) if(!isZero(D(a[i][j],y[k]))) return null;
    }
    b[i]=S(D(B,y[i]));
    for(k=0;k<n;k++) if(!isZero(D(b[i],y[k]))) return null;
  }
  var recA=[];
  for(i=0;i<n;i++) for(j=0;j<n;j++) recA.push(mul(mul(a[i][j],y[i]),y[j]));
  if(!isZero(sub(A,S(sum(recA))))) return null;
  var recB=[]; for(i=0;i<n;i++) recB.push(mul(b[i],y[i]));
  if(!isZero(sub(B,S(sum(recB))))) return null;
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
  if(isZero(det)) throw new Error("The metric/fundamental tensor is degenerate.");
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
function lcConnection(g,gInv,x,n){
  var Gamma=[],upper,i,j,l,terms;
  for(upper=0;upper<n;upper++){ Gamma[upper]=[]; for(i=0;i<n;i++) Gamma[upper][i]=new Array(n).fill("0"); }
  for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
    terms=[];
    for(l=0;l<n;l++){
      var bracket=add(add(D(g[l][j],x[i]),D(g[i][l],x[j])),neg(D(g[i][j],x[l])));
      terms.push(mul(gInv[upper][l],bracket));
    }
    var gam=S(mul("0.5",sum(terms))); Gamma[upper][i][j]=gam; Gamma[upper][j][i]=gam;
  }
  return Gamma;
}
function randersData(parts,n,y){
  var alpha="sqrt("+parts.A+")", beta=parts.B, F=add(alpha,beta);
  var aInvData=inverseMatrix(parts.a), aInv=aInvData.matrix;
  var yLower=[],bUp=[],i,j;
  for(i=0;i<n;i++){
    var yt=[],bt=[];
    for(j=0;j<n;j++){ yt.push(mul(parts.a[i][j],y[j])); bt.push(mul(aInv[i][j],parts.b[j])); }
    yLower[i]=S(sum(yt)); bUp[i]=S(sum(bt));
  }
  var b2Terms=[]; for(i=0;i<n;i++) b2Terms.push(mul(bUp[i],parts.b[i]));
  var b2=S(sum(b2Terms));
  var g=[],gInv=[];
  for(i=0;i<n;i++){
    g[i]=[]; gInv[i]=[];
    for(j=0;j<n;j++){
      g[i][j]=S(sum([
        mul(div(F,alpha),parts.a[i][j]),
        div(add(mul(parts.b[i],yLower[j]),mul(parts.b[j],yLower[i])),alpha),
        neg(div(mul(beta,mul(yLower[i],yLower[j])),pow(alpha,3))),
        mul(parts.b[i],parts.b[j])
      ]));
      gInv[i][j]=S(sum([
        mul(div(alpha,F),aInv[i][j]),
        neg(mul(div(alpha,pow(F,2)),add(mul(bUp[i],y[j]),mul(bUp[j],y[i])))),
        mul(div(add(mul(b2,alpha),beta),pow(F,3)),mul(y[i],y[j]))
      ]));
    }
  }
  var detg=S(mul(pow(div(F,alpha),n+1),aInvData.det));
  return {alpha:alpha,beta:beta,F:F,aInv:aInv,aDet:aInvData.det,bUp:bUp,b2:b2,g:g,gInv:gInv,detg:detg};
}
function parallelOneForm(b,Gamma,x,n){
  for(var i=0;i<n;i++) for(var j=0;j<n;j++){
    var terms=[D(b[j],x[i])];
    for(var l=0;l<n;l++) terms.push(neg(mul(Gamma[l][i][j],b[l])));
    if(!isZero(S(sum(terms)))) return false;
  }
  return true;
}
function horizontalDerivative(expr,i,x,y,N){
  var terms=[D(expr,x[i])];
  for(var a=0;a<y.length;a++) terms.push(neg(mul(N[a][i],D(expr,y[a]))));
  return S(sum(terms));
}
function affineCurvature(Gamma,x,n,post){
  var AR=[],upper,l,i,j,m,terms;
  for(upper=0;upper<n;upper++){ AR[upper]=[]; for(l=0;l<n;l++){ AR[upper][l]=[]; for(i=0;i<n;i++) AR[upper][l][i]=new Array(n).fill("0"); } }
  for(upper=0;upper<n;upper++) for(l=0;l<n;l++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
    if(post) postStep("Computing R̄^"+(upper+1)+"_"+(l+1)+(i+1)+(j+1));
    var cstart=performance.now();
    terms=[D(Gamma[upper][j][l],x[i]),neg(D(Gamma[upper][i][l],x[j]))];
    for(m=0;m<n;m++){ terms.push(mul(Gamma[upper][i][m],Gamma[m][j][l])); terms.push(neg(mul(Gamma[upper][j][m],Gamma[m][i][l]))); }
    var v=S(sum(terms)); AR[upper][l][i][j]=v; AR[upper][l][j][i]=neg(v);
    if(post) postComponent("affineCurvature","\\bar R^{"+(upper+1)+"}{}_{"+(l+1)+(i+1)+(j+1)+"}",v,performance.now()-cstart);
  }
  return AR;
}

async function calculate(msg){
  resetCaches();
  activeOutputs=msg.outputs||Object.create(null);
  var totalStart=performance.now();
  var n=msg.n, mode=msg.mode, inputType=msg.inputType||"lagrangian";
  var x=vars("x",n), y=vars("y",n), L=msg.L||"", randers=null;
  var g=[],gInv=[],detg="0",riemannian=false,parallelRanders=false;
  var i,j,k,a,upper,l,m,terms,cstart,secStart;
  var alphaGamma=null;

  if(inputType==="metric"){
    postMessage({type:"path",path:"Pseudo-Riemannian metric input"});
    postSectionStart("metric","Metric tensor","g_{ij}(x)"); secStart=performance.now();
    g=parseMetricMatrix(msg.metricText||"",n,y);
    for(i=0;i<n;i++) for(j=i;j<n;j++) postComponent("metric","g_{"+(i+1)+(j+1)+"}",g[i][j],0);
    postSectionComplete("metric",performance.now()-secStart,{matrix:g});
    riemannian=true;
    postSectionStart("inverse","Inverse metric","g^{ij} and det(g)"); secStart=performance.now(); postStep("Inverting the metric"); cstart=performance.now();
    var metricInvData=inverseMatrix(g); gInv=metricInvData.matrix; detg=metricInvData.det;
    var invElapsed=performance.now()-cstart;
    for(i=0;i<n;i++) for(j=i;j<n;j++) postComponent("inverse","g^{"+(i+1)+(j+1)+"}",gInv[i][j],invElapsed/(n*(n+1)/2));
    postComponent("inverse","\\det(g)",detg,0); postSectionComplete("inverse",performance.now()-secStart,{matrix:gInv,det:detg});
  }else{
    if(!L) throw new Error("Enter a Finsler Lagrangian first.");
    math.parse(L);
    randers=detectRanders(L,n);
    postMessage({type:"path",path:randers?"Randers fast path":"general symbolic path"});

    postSectionStart("metric","Fundamental tensor","g_{ij}"); secStart=performance.now();
    if(randers){
      postStep("Building Randers fundamental tensor");
      var rd=randersData(randers,n,y); g=rd.g; gInv=rd.gInv; detg=rd.detg;
      for(i=0;i<n;i++) for(j=i;j<n;j++){ cstart=performance.now(); postComponent("metric","g_{"+(i+1)+(j+1)+"}",g[i][j],performance.now()-cstart); }
      postSectionComplete("metric",performance.now()-secStart,{matrix:g});
      postSectionStart("inverse","Inverse fundamental tensor","g^{ij} and det(g)"); secStart=performance.now();
      for(i=0;i<n;i++) for(j=i;j<n;j++) postComponent("inverse","g^{"+(i+1)+(j+1)+"}",gInv[i][j],0);
      postComponent("inverse","\\det(g)",detg,0); postSectionComplete("inverse",performance.now()-secStart,{matrix:gInv,det:detg});

      alphaGamma=lcConnection(randers.a,rd.aInv,x,n);
      postStep("Checking whether the Randers 1-form is parallel");
      parallelRanders=parallelOneForm(randers.b,alphaGamma,x,n);
      if(parallelRanders) postMessage({type:"path",path:"Randers fast path — parallel 1-form / Berwald"});
      riemannian=false;
    }else{
      for(i=0;i<n;i++) g[i]=new Array(n).fill("0");
      for(i=0;i<n;i++) for(j=i;j<n;j++){
        postStep("Computing g_{"+(i+1)+(j+1)+"}"); cstart=performance.now();
        var gv=S(mul("0.5",D(D(L,y[i]),y[j]))); g[i][j]=gv; g[j][i]=gv;
        postComponent("metric","g_{"+(i+1)+(j+1)+"}",gv,performance.now()-cstart);
      }
      postSectionComplete("metric",performance.now()-secStart,{matrix:g});
      postSectionStart("inverse","Inverse fundamental tensor","g^{ij} and det(g)"); secStart=performance.now(); postStep("Inverting the fundamental tensor"); cstart=performance.now();
      var invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; var totalInv=performance.now()-cstart;
      for(i=0;i<n;i++) for(j=i;j<n;j++) postComponent("inverse","g^{"+(i+1)+(j+1)+"}",gInv[i][j],totalInv/(n*(n+1)/2));
      postComponent("inverse","\\det(g)",detg,0); postSectionComplete("inverse",performance.now()-secStart,{matrix:gInv,det:detg});
      riemannian=true;
      outer: for(i=0;i<n;i++) for(j=0;j<n;j++) for(a=0;a<n;a++) if(!isZero(D(g[i][j],y[a]))){ riemannian=false; break outer; }
    }
  }

  if(want("cartan")){
    postSectionStart("cartan","Cartan tensor","C_{ijk}"); secStart=performance.now();
    if(riemannian){ postComponent("cartan","C_{ijk}","0",0); }
    else{
      for(i=0;i<n;i++) for(j=i;j<n;j++) for(k=j;k<n;k++){
        postStep("Computing C_{"+(i+1)+(j+1)+(k+1)+"}"); cstart=performance.now();
        var cv=S(mul("0.5",D(g[j][k],y[i]))); postComponent("cartan","C_{"+(i+1)+(j+1)+(k+1)+"}",cv,performance.now()-cstart);
      }
    }
    postSectionComplete("cartan",performance.now()-secStart);
  }

  var G=[],N=[]; for(i=0;i<n;i++) N[i]=new Array(n).fill("0");
  var Gamma=null,B=null,Ch=null,affineGamma=null;
  if(riemannian||parallelRanders){
    Gamma=riemannian?lcConnection(g,gInv,x,n):alphaGamma;
    affineGamma=Gamma;
    postSectionStart("christoffel","Christoffel symbols",parallelRanders?"Berwald = Chern–Rund = pp-wave Levi-Civita":"Berwald = Chern–Rund = Levi-Civita"); secStart=performance.now();
    if(want("connections")) for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
      cstart=performance.now(); postComponent("christoffel","\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",Gamma[upper][i][j],performance.now()-cstart);
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

    if(want("connections")){
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
  }

  if(mode!=="curvature"){ postMessage({type:"done",totalMs:performance.now()-totalStart}); return; }

  var R=[],AR=null;
  if(affineGamma){
    if(want("affine")) postSectionStart("affineCurvature","Affine curvature","\\bar R^k{}_{lij}");
    secStart=performance.now(); AR=affineCurvature(affineGamma,x,n,want("affine"));
    if(want("affine")) postSectionComplete("affineCurvature",performance.now()-secStart);

    var aRic=[]; for(i=0;i<n;i++) aRic[i]=new Array(n).fill("0");
    if(want("affine")) postSectionStart("affineRicci","Affine Ricci tensor","\\bar R_{ij}"); secStart=performance.now();
    for(l=0;l<n;l++) for(j=0;j<n;j++){
      if(want("affine")) postStep("Computing R̄_"+(l+1)+(j+1)); cstart=performance.now(); terms=[]; for(i=0;i<n;i++) terms.push(AR[i][l][i][j]);
      aRic[l][j]=S(sum(terms)); if(want("affine")) postComponent("affineRicci","\\bar R_{"+(l+1)+(j+1)+"}",aRic[l][j],performance.now()-cstart);
    }
    if(want("affine")) postSectionComplete("affineRicci",performance.now()-secStart,{matrix:aRic});

    postSectionStart("curvature","Nonlinear curvature","R^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++){ R[upper]=[]; for(i=0;i<n;i++) R[upper][i]=new Array(n).fill("0"); }
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      postStep("Computing R^"+(upper+1)+"_"+(i+1)+(j+1)); cstart=performance.now(); terms=[]; for(l=0;l<n;l++) terms.push(mul(AR[upper][l][i][j],y[l]));
      var rv=S(sum(terms)); R[upper][i][j]=rv; R[upper][j][i]=neg(rv); postComponent("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv,performance.now()-cstart);
    }
    postSectionComplete("curvature",performance.now()-secStart);
  }else{
    postSectionStart("curvature","Nonlinear curvature","R^k{}_{ij}"); secStart=performance.now();
    for(upper=0;upper<n;upper++){ R[upper]=[]; for(i=0;i<n;i++) R[upper][i]=new Array(n).fill("0"); }
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      postStep("Computing R^"+(upper+1)+"_"+(i+1)+(j+1)); cstart=performance.now();
      var rv2=S(sub(horizontalDerivative(N[upper][j],i,x,y,N),horizontalDerivative(N[upper][i],j,x,y,N)));
      R[upper][i][j]=rv2; R[upper][j][i]=neg(rv2); postComponent("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv2,performance.now()-cstart);
    }
    postSectionComplete("curvature",performance.now()-secStart);
  }

  if(want("deviation")){
    postSectionStart("deviation","Geodesic deviation tensor","R^k{}_i"); secStart=performance.now();
    var dev=[]; for(upper=0;upper<n;upper++) dev[upper]=new Array(n).fill("0");
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
      postStep("Computing R^"+(upper+1)+"_"+(i+1)); cstart=performance.now(); terms=[]; for(j=0;j<n;j++) terms.push(mul(R[upper][i][j],y[j]));
      dev[upper][i]=S(sum(terms)); postComponent("deviation","R^{"+(upper+1)+"}{}_{"+(i+1)+"}",dev[upper][i],performance.now()-cstart);
    }
    postSectionComplete("deviation",performance.now()-secStart,{matrix:dev});
  }

  if(want("ricci")){
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
  }
  postMessage({type:"done",totalMs:performance.now()-totalStart});
}

onmessage=function(event){
  if(!event.data||event.data.type!=="calculate") return;
  calculate(event.data).catch(function(error){ postMessage({type:"error",message:error&&error.message?error.message:String(error)}); });
};
