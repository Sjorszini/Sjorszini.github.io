"use strict";

importScripts("https://cdn.jsdelivr.net/npm/mathjs@11.11.2/lib/browser/math.js");

var simplifyCache = Object.create(null);
var presentCache = Object.create(null);
var derivativeCache = Object.create(null);
var activeOutputs = Object.create(null);

function resetCaches(){ simplifyCache=Object.create(null); presentCache=Object.create(null); derivativeCache=Object.create(null); }
function raw(expr){ return typeof expr === "string" ? expr : expr.toString(); }
function S(expr){
  var text=raw(expr);
  if(simplifyCache[text]!==undefined) return simplifyCache[text];
  var value=text;
  try{ value=math.simplify(text).toString({parenthesis:"auto"}); }catch(e){}
  simplifyCache[text]=value;
  return value;
}
function PS(expr){
  var text=S(expr);
  if(presentCache[text]!==undefined) return presentCache[text];
  var best=text, current=text;
  for(var i=0;i<4;i++){
    try{
      var next=math.simplify(current).toString({parenthesis:"auto"});
      if(next.length<best.length) best=next;
      if(next===current) break;
      current=next;
    }catch(e){ break; }
  }
  presentCache[text]=best;
  return best;
}
function D(expr,variable){
  var text=raw(expr), key=variable+"\u0000"+text;
  if(derivativeCache[key]!==undefined) return derivativeCache[key];
  var value=S(math.derivative(math.parse(text),variable));
  derivativeCache[key]=value;
  return value;
}
function add(a,b){ if(a==="0") return b; if(b==="0") return a; return "("+a+")+("+b+")"; }
function sub(a,b){ if(b==="0") return a; return "("+a+")-("+b+")"; }
function neg(a){ if(a==="0") return "0"; return "-("+a+")"; }
function mul(a,b){ if(a==="0"||b==="0") return "0"; if(a==="1") return b; if(b==="1") return a; if(a==="-1") return neg(b); if(b==="-1") return neg(a); return "("+a+")*("+b+")"; }
function div(a,b){ if(a==="0") return "0"; if(b==="1") return a; return "("+a+")/("+b+")"; }
function pow(a,p){ return "("+a+")^("+p+")"; }
function sum(items){ var out="0"; for(var i=0;i<items.length;i++) out=add(out,items[i]); return out; }
function vars(prefix,n){ var out=[]; for(var i=1;i<=n;i++) out.push(prefix+i); return out; }
function isZero(expr){ var v=S(expr).replace(/\s+/g,""); return v==="0"||v==="0.0"||v==="-0"; }
function want(key){ return activeOutputs[key]===true; }
function sectionKey(section){
  var map={metric:"metric",inverse:"inverse",cartan:"cartan",spray:"spray",nonlinear:"nonlinear",christoffel:"connections",berwald:"connections",chern:"connections",curvature:"curvature",deviation:"deviation",ricci:"ricci",affineCurvature:"affine",affineRicci:"affine"};
  return map[section]||section;
}
function shouldPost(section){ return want(sectionKey(section)); }
function simplifySummary(summary){
  if(!summary) return summary;
  var out={};
  Object.keys(summary).forEach(function(key){
    var value=summary[key];
    if(Array.isArray(value)) out[key]=value.map(function(row){ return Array.isArray(row)?row.map(PS):PS(row); });
    else if(typeof value==="string") out[key]=PS(value);
    else out[key]=value;
  });
  return out;
}
function postPath(path){ postMessage({type:"path",path:path}); }
function postStep(label){ postMessage({type:"stepStart",label:label}); }
function startSection(section,title,meta){ if(shouldPost(section)) postMessage({type:"sectionStart",section:section,title:title,meta:meta||""}); }
function emit(section,label,value,start){
  if(!shouldPost(section)) return;
  var displayed=PS(value);
  postMessage({type:"component",section:section,label:label,value:displayed,elapsedMs:performance.now()-start});
}
function endSection(section,start,summary){ if(shouldPost(section)) postMessage({type:"sectionComplete",section:section,elapsedMs:performance.now()-start,summary:simplifySummary(summary)}); }

function validateExpression(expr,label,y){
  if(!expr || !String(expr).trim()) throw new Error(label+" is empty.");
  math.parse(expr);
  for(var a=0;a<y.length;a++) if(!isZero(D(expr,y[a]))) throw new Error(label+" may depend on x, but not on y.");
  return S(expr);
}
function parseMetricEntries(entries,n,y){
  if(!Array.isArray(entries)||entries.length!==n) throw new Error("Metric input is incomplete.");
  var g=[],i,j;
  for(i=0;i<n;i++){
    if(!Array.isArray(entries[i])||entries[i].length!==n) throw new Error("Metric input is incomplete.");
    g[i]=[];
    for(j=0;j<n;j++) g[i][j]=validateExpression(entries[i][j],"g"+(i+1)+(j+1),y);
  }
  for(i=0;i<n;i++) for(j=i+1;j<n;j++) if(!isZero(sub(g[i][j],g[j][i]))) throw new Error("The metric must be symmetric: g"+(i+1)+(j+1)+" differs from g"+(j+1)+(i+1)+".");
  return g;
}
function parseOneForm(entries,n,y){
  if(!Array.isArray(entries)||entries.length!==n) throw new Error("The 1-form input is incomplete.");
  var b=[]; for(var i=0;i<n;i++) b[i]=validateExpression(entries[i],"b"+(i+1),y); return b;
}
function quadraticForm(g,y){ var t=[]; for(var i=0;i<g.length;i++) for(var j=0;j<g.length;j++) t.push(mul(mul(g[i][j],y[i]),y[j])); return S(sum(t)); }
function linearForm(b,y){ var t=[]; for(var i=0;i<b.length;i++) t.push(mul(b[i],y[i])); return S(sum(t)); }
function alphaBetaLagrangian(A,B,type,mValue){
  if(type==="randers") return S(pow(add("sqrt("+A+")",B),2));
  if(type==="kropina") return S(div(pow(A,2),pow(B,2)));
  if(type==="mkropina"){
    var m=String(mValue==null?"1":mValue).trim();
    if(!m) throw new Error("Enter m for the m-Kropina metric.");
    math.parse(m);
    return S(div(pow(A,"1+("+m+")"),pow(B,"2*("+m+")")));
  }
  if(type==="matsumoto") return S(div(pow(A,2),pow(sub("sqrt("+A+")",B),2)));
  throw new Error("Unknown α–β metric type.");
}
function alphaBetaName(type){ return {randers:"Randers",kropina:"Kropina",mkropina:"m-Kropina",matsumoto:"Matsumoto"}[type]||"α–β"; }

function minor(matrix,row,col){
  var out=[];
  for(var i=0;i<matrix.length;i++){
    if(i===row) continue;
    var line=[]; for(var j=0;j<matrix.length;j++) if(j!==col) line.push(matrix[i][j]); out.push(line);
  }
  return out;
}
function detRaw(matrix){
  var n=matrix.length;
  if(n===1) return matrix[0][0];
  if(n===2) return sub(mul(matrix[0][0],matrix[1][1]),mul(matrix[0][1],matrix[1][0]));
  var terms=[]; for(var c=0;c<n;c++){ var t=mul(matrix[0][c],detRaw(minor(matrix,0,c))); if(c%2) t=neg(t); terms.push(t); } return sum(terms);
}
function inverseMatrix(matrix){
  var n=matrix.length, det=S(detRaw(matrix));
  if(isZero(det)) throw new Error("The metric/fundamental tensor is degenerate.");
  var inv=[];
  for(var i=0;i<n;i++){
    inv[i]=[];
    for(var j=0;j<n;j++){
      var cof=detRaw(minor(matrix,j,i)); if((i+j)%2) cof=neg(cof); inv[i][j]=S(div(cof,det));
    }
  }
  return {matrix:inv,det:det};
}
function lcConnection(g,gInv,x,n){
  var Gamma=[],upper,i,j,l,terms;
  for(upper=0;upper<n;upper++){ Gamma[upper]=[]; for(i=0;i<n;i++) Gamma[upper][i]=new Array(n).fill("0"); }
  for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
    terms=[];
    for(l=0;l<n;l++) terms.push(mul(gInv[upper][l],add(add(D(g[l][j],x[i]),D(g[i][l],x[j])),neg(D(g[i][j],x[l])))));
    var gam=S(mul("0.5",sum(terms))); Gamma[upper][i][j]=gam; Gamma[upper][j][i]=gam;
  }
  return Gamma;
}
function parallelOneForm(b,Gamma,x,n){
  for(var i=0;i<n;i++) for(var j=0;j<n;j++){
    var terms=[D(b[j],x[i])]; for(var l=0;l<n;l++) terms.push(neg(mul(Gamma[l][i][j],b[l])));
    if(!isZero(S(sum(terms)))) return false;
  }
  return true;
}
function horizontalDerivative(expr,i,x,y,N){ var terms=[D(expr,x[i])]; for(var a=0;a<y.length;a++) terms.push(neg(mul(N[a][i],D(expr,y[a])))); return S(sum(terms)); }
function randersData(a,b,A,B,n,y){
  var alpha="sqrt("+A+")", F=add(alpha,B), aInvData=inverseMatrix(a), aInv=aInvData.matrix;
  var yLower=[],bUp=[],i,j;
  for(i=0;i<n;i++){
    var yt=[],bt=[]; for(j=0;j<n;j++){ yt.push(mul(a[i][j],y[j])); bt.push(mul(aInv[i][j],b[j])); }
    yLower[i]=S(sum(yt)); bUp[i]=S(sum(bt));
  }
  var b2t=[]; for(i=0;i<n;i++) b2t.push(mul(bUp[i],b[i])); var b2=S(sum(b2t));
  var g=[],gInv=[];
  for(i=0;i<n;i++){
    g[i]=[]; gInv[i]=[];
    for(j=0;j<n;j++){
      g[i][j]=S(sum([mul(div(F,alpha),a[i][j]),div(add(mul(b[i],yLower[j]),mul(b[j],yLower[i])),alpha),neg(div(mul(B,mul(yLower[i],yLower[j])),pow(alpha,3))),mul(b[i],b[j])]));
      gInv[i][j]=S(sum([mul(div(alpha,F),aInv[i][j]),neg(mul(div(alpha,pow(F,2)),add(mul(bUp[i],y[j]),mul(bUp[j],y[i])))),mul(div(add(mul(b2,alpha),B),pow(F,3)),mul(y[i],y[j]))]));
    }
  }
  return {g:g,gInv:gInv,detg:S(mul(pow(div(F,alpha),n+1),aInvData.det)),aInv:aInv};
}
function affineCurvature(Gamma,x,n,postOutput){
  var AR=[],upper,l,i,j,m,terms;
  for(upper=0;upper<n;upper++){ AR[upper]=[]; for(l=0;l<n;l++){ AR[upper][l]=[]; for(i=0;i<n;i++) AR[upper][l][i]=new Array(n).fill("0"); } }
  for(upper=0;upper<n;upper++) for(l=0;l<n;l++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
    if(postOutput) postStep("Simplifying affine curvature R̄^"+(upper+1)+"_"+(l+1)+(i+1)+(j+1));
    var st=performance.now();
    terms=[D(Gamma[upper][j][l],x[i]),neg(D(Gamma[upper][i][l],x[j]))];
    for(m=0;m<n;m++){ terms.push(mul(Gamma[upper][i][m],Gamma[m][j][l])); terms.push(neg(mul(Gamma[upper][j][m],Gamma[m][i][l]))); }
    var v=S(sum(terms)); AR[upper][l][i][j]=v; AR[upper][l][j][i]=neg(v);
    if(postOutput) emit("affineCurvature","\\bar R^{"+(upper+1)+"}{}_{"+(l+1)+(i+1)+(j+1)+"}",v,st);
  }
  return AR;
}

async function calculate(msg){
  resetCaches(); activeOutputs=msg.outputs||Object.create(null);
  var totalStart=performance.now(), n=msg.n, inputType=msg.inputType||"lagrangian", x=vars("x",n), y=vars("y",n);
  var needCurvature=want("curvature")||want("deviation")||want("ricci")||want("affine");
  var needConnection=want("spray")||want("nonlinear")||want("connections")||needCurvature;
  var needInverse=want("inverse")||needConnection;
  var L="", g=[],gInv=[],detg="0",riemannian=false,parallelBeta=false,baseMetric=null,baseInv=null,baseGamma=null,beta=null;
  var i,j,k,upper,l,m,terms,st,sec,invData;
  var alphaBetaType=null;

  function streamMetric(title,meta){
    if(!want("metric")) return;
    startSection("metric",title,meta); sec=performance.now();
    for(i=0;i<n;i++) for(j=i;j<n;j++){ postStep("Simplifying g_"+(i+1)+(j+1)); st=performance.now(); emit("metric","g_{"+(i+1)+(j+1)+"}",g[i][j],st); }
    endSection("metric",sec,{matrix:g});
  }
  function streamInverse(title){
    if(!want("inverse")) return;
    startSection("inverse",title,"g^{ij} and det(g)"); sec=performance.now();
    for(i=0;i<n;i++) for(j=i;j<n;j++){ postStep("Simplifying g^"+(i+1)+(j+1)); st=performance.now(); emit("inverse","g^{"+(i+1)+(j+1)+"}",gInv[i][j],st); }
    st=performance.now(); emit("inverse","\\det(g)",detg,st); endSection("inverse",sec,{matrix:gInv,det:detg});
  }

  if(inputType==="metric"){
    baseMetric=parseMetricEntries(msg.metricEntries,n,y);
    var ab=msg.alphaBeta||{enabled:false};
    if(!ab.enabled){
      riemannian=true; g=baseMetric; postPath("Pseudo-Riemannian metric");
      streamMetric("Metric tensor","g_{ij}(x)");
      if(needInverse){ postStep("Inverting the metric"); invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; streamInverse("Inverse metric"); }
      if(needConnection){
        if(!needInverse){ invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; }
        if(want("connections")){ startSection("christoffel","Christoffel symbols","Levi-Civita / Berwald / Chern–Rund"); sec=performance.now(); }
        baseGamma=[];
        for(upper=0;upper<n;upper++){ baseGamma[upper]=[]; for(i=0;i<n;i++) baseGamma[upper][i]=new Array(n).fill("0"); }
        for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
          if(want("connections")) postStep("Computing and simplifying Γ^"+(upper+1)+"_"+(i+1)+(j+1));
          st=performance.now(); terms=[];
          for(l=0;l<n;l++) terms.push(mul(gInv[upper][l],add(add(D(g[l][j],x[i]),D(g[i][l],x[j])),neg(D(g[i][j],x[l])))));
          var gam=S(mul("0.5",sum(terms))); baseGamma[upper][i][j]=gam; baseGamma[upper][j][i]=gam;
          if(want("connections")) emit("christoffel","\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",gam,st);
        }
        if(want("connections")) endSection("christoffel",sec);
      }
    }else{
      alphaBetaType=ab.type||"randers"; beta=parseOneForm(ab.b,n,y);
      var A=quadraticForm(baseMetric,y), B=linearForm(beta,y);
      L=alphaBetaLagrangian(A,B,alphaBetaType,ab.m);
      postPath(alphaBetaName(alphaBetaType)+" α–β metric");

      if(alphaBetaType==="randers"){
        postStep("Building the Randers fundamental tensor");
        var rd=randersData(baseMetric,beta,A,B,n,y); g=rd.g; gInv=rd.gInv; detg=rd.detg; baseInv=rd.aInv;
        streamMetric("Fundamental tensor","g_{ij} for "+alphaBetaName(alphaBetaType));
        streamInverse("Inverse fundamental tensor");
      }else{
        if(want("metric")){ startSection("metric","Fundamental tensor","g_{ij} for "+alphaBetaName(alphaBetaType)); sec=performance.now(); }
        for(i=0;i<n;i++) g[i]=new Array(n).fill("0");
        for(i=0;i<n;i++) for(j=i;j<n;j++){
          if(want("metric")) postStep("Computing and simplifying g_"+(i+1)+(j+1)); st=performance.now();
          var gv=S(mul("0.5",D(D(L,y[i]),y[j]))); g[i][j]=gv; g[j][i]=gv;
          if(want("metric")) emit("metric","g_{"+(i+1)+(j+1)+"}",gv,st);
        }
        if(want("metric")) endSection("metric",sec,{matrix:g});
        if(needInverse){ postStep("Inverting the fundamental tensor"); invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; streamInverse("Inverse fundamental tensor"); }
      }

      if(needConnection){
        if(!baseInv){ postStep("Inverting the α metric"); var aid=inverseMatrix(baseMetric); baseInv=aid.matrix; }
        postStep("Computing the Levi-Civita connection of α"); baseGamma=lcConnection(baseMetric,baseInv,x,n);
        postStep("Checking whether β is parallel"); parallelBeta=parallelOneForm(beta,baseGamma,x,n);
        if(parallelBeta) postPath(alphaBetaName(alphaBetaType)+" α–β metric · parallel β / Berwald fast path");
        if(!gInv.length){ postStep("Inverting the fundamental tensor"); invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; streamInverse("Inverse fundamental tensor"); }
      }
    }
  }else{
    L=String(msg.L||"").trim(); if(!L) throw new Error("Enter a Finsler Lagrangian first."); math.parse(L); postPath("General Finsler Lagrangian");
    if(want("metric")){ startSection("metric","Fundamental tensor","g_{ij}"); sec=performance.now(); }
    for(i=0;i<n;i++) g[i]=new Array(n).fill("0");
    for(i=0;i<n;i++) for(j=i;j<n;j++){
      if(want("metric")) postStep("Computing and simplifying g_"+(i+1)+(j+1)); st=performance.now();
      var gv2=S(mul("0.5",D(D(L,y[i]),y[j]))); g[i][j]=gv2; g[j][i]=gv2;
      if(want("metric")) emit("metric","g_{"+(i+1)+(j+1)+"}",gv2,st);
    }
    if(want("metric")) endSection("metric",sec,{matrix:g});
    if(needInverse){ postStep("Inverting the fundamental tensor"); invData=inverseMatrix(g); gInv=invData.matrix; detg=invData.det; streamInverse("Inverse fundamental tensor"); }
    if(needConnection){
      riemannian=true;
      outer: for(i=0;i<n;i++) for(j=0;j<n;j++) for(k=0;k<n;k++) if(!isZero(D(g[i][j],y[k]))){ riemannian=false; break outer; }
      if(riemannian){
        postPath("Quadratic / pseudo-Riemannian Lagrangian");
        if(want("connections")){ startSection("christoffel","Christoffel symbols","Levi-Civita / Berwald / Chern–Rund"); sec=performance.now(); }
        baseGamma=[];
        for(upper=0;upper<n;upper++){ baseGamma[upper]=[]; for(i=0;i<n;i++) baseGamma[upper][i]=new Array(n).fill("0"); }
        for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
          if(want("connections")) postStep("Computing and simplifying Γ^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); terms=[];
          for(l=0;l<n;l++) terms.push(mul(gInv[upper][l],add(add(D(g[l][j],x[i]),D(g[i][l],x[j])),neg(D(g[i][j],x[l])))));
          var gam2=S(mul("0.5",sum(terms))); baseGamma[upper][i][j]=gam2; baseGamma[upper][j][i]=gam2;
          if(want("connections")) emit("christoffel","\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",gam2,st);
        }
        if(want("connections")) endSection("christoffel",sec);
      }
    }
  }

  if(want("cartan")){
    startSection("cartan","Cartan tensor","C_{ijk}"); sec=performance.now();
    if(riemannian){ st=performance.now(); emit("cartan","C_{ijk}","0",st); }
    else for(i=0;i<n;i++) for(j=i;j<n;j++) for(k=j;k<n;k++){
      postStep("Computing and simplifying C_"+(i+1)+(j+1)+(k+1)); st=performance.now(); var cv=S(mul("0.5",D(g[j][k],y[i]))); emit("cartan","C_{"+(i+1)+(j+1)+(k+1)+"}",cv,st);
    }
    endSection("cartan",sec);
  }

  if(!needConnection){ postMessage({type:"done",totalMs:performance.now()-totalStart}); return; }

  var G=[],N=[]; for(i=0;i<n;i++) N[i]=new Array(n).fill("0");
  var affineGamma=null;
  if(riemannian||parallelBeta){
    affineGamma=baseGamma;
    if(parallelBeta && want("connections")){
      startSection("christoffel","Christoffel symbols","Berwald = Chern–Rund = Levi-Civita of α"); sec=performance.now();
      for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){ postStep("Simplifying Γ^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); emit("christoffel","\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",affineGamma[upper][i][j],st); }
      endSection("christoffel",sec);
    }
    if(want("spray")) startSection("spray","Geodesic spray","G^i"); sec=performance.now();
    for(upper=0;upper<n;upper++){
      if(want("spray")) postStep("Computing and simplifying G^"+(upper+1)); st=performance.now(); terms=[];
      for(i=0;i<n;i++) for(j=0;j<n;j++) terms.push(mul(mul(affineGamma[upper][i][j],y[i]),y[j])); G[upper]=S(sum(terms));
      if(want("spray")) emit("spray","G^{"+(upper+1)+"}",G[upper],st);
    }
    if(want("spray")) endSection("spray",sec,{vector:G});

    if(want("nonlinear")) startSection("nonlinear","Nonlinear connection","N^i{}_j"); sec=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
      if(want("nonlinear")) postStep("Computing and simplifying N^"+(upper+1)+"_"+(i+1)); st=performance.now(); terms=[];
      for(j=0;j<n;j++) terms.push(mul(affineGamma[upper][i][j],y[j])); N[upper][i]=S(sum(terms));
      if(want("nonlinear")) emit("nonlinear","N^{"+(upper+1)+"}{}_{"+(i+1)+"}",N[upper][i],st);
    }
    if(want("nonlinear")) endSection("nonlinear",sec,{matrix:N});
  }else{
    var dLy=[],dLx=[]; for(i=0;i<n;i++){ dLy[i]=D(L,y[i]); dLx[i]=D(L,x[i]); }
    if(want("spray")) startSection("spray","Geodesic spray","G^i"); sec=performance.now();
    for(upper=0;upper<n;upper++){
      if(want("spray")) postStep("Computing and simplifying G^"+(upper+1)); st=performance.now(); terms=[];
      for(k=0;k<n;k++){ var inner=[]; for(m=0;m<n;m++) inner.push(mul(y[m],D(dLy[k],x[m]))); terms.push(mul(gInv[upper][k],sub(sum(inner),dLx[k]))); }
      G[upper]=S(mul("0.5",sum(terms))); if(want("spray")) emit("spray","G^{"+(upper+1)+"}",G[upper],st);
    }
    if(want("spray")) endSection("spray",sec,{vector:G});

    if(want("nonlinear")) startSection("nonlinear","Nonlinear connection","N^i{}_j"); sec=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){
      if(want("nonlinear")) postStep("Computing and simplifying N^"+(upper+1)+"_"+(i+1)); st=performance.now(); N[upper][i]=S(mul("0.5",D(G[upper],y[i])));
      if(want("nonlinear")) emit("nonlinear","N^{"+(upper+1)+"}{}_{"+(i+1)+"}",N[upper][i],st);
    }
    if(want("nonlinear")) endSection("nonlinear",sec,{matrix:N});

    if(want("connections")){
      startSection("berwald","Berwald Christoffel symbols","{}^B\\Gamma^k{}_{ij}"); sec=performance.now();
      for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){ postStep("Computing and simplifying Berwald Γ^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); var bv=S(mul("0.5",D(D(G[upper],y[i]),y[j]))); emit("berwald","{}^B\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",bv,st); }
      endSection("berwald",sec);
      startSection("chern","Chern–Rund Christoffel symbols","{}^C\\Gamma^k{}_{ij}"); sec=performance.now();
      for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i;j<n;j++){
        postStep("Computing and simplifying Chern–Rund Γ^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); terms=[];
        for(l=0;l<n;l++) terms.push(mul(gInv[upper][l],add(add(horizontalDerivative(g[l][j],i,x,y,N),horizontalDerivative(g[i][l],j,x,y,N)),neg(horizontalDerivative(g[i][j],l,x,y,N)))));
        emit("chern","{}^C\\Gamma^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",S(mul("0.5",sum(terms))),st);
      }
      endSection("chern",sec);
    }
  }

  if(!needCurvature){ postMessage({type:"done",totalMs:performance.now()-totalStart}); return; }

  var R=[],AR=null;
  for(upper=0;upper<n;upper++){ R[upper]=[]; for(i=0;i<n;i++) R[upper][i]=new Array(n).fill("0"); }
  if(affineGamma){
    if(want("affine")){ startSection("affineCurvature","Affine curvature","\\bar R^k{}_{lij}"); sec=performance.now(); }
    AR=affineCurvature(affineGamma,x,n,want("affine"));
    if(want("affine")) endSection("affineCurvature",sec);

    if(want("affine")){
      startSection("affineRicci","Affine Ricci tensor","\\bar R_{ij}"); sec=performance.now(); var aRic=[]; for(i=0;i<n;i++) aRic[i]=new Array(n).fill("0");
      for(l=0;l<n;l++) for(j=0;j<n;j++){ terms=[]; for(i=0;i<n;i++) terms.push(AR[i][l][i][j]); var ar=S(sum(terms)); aRic[l][j]=ar; postStep("Simplifying R̄_"+(l+1)+(j+1)); st=performance.now(); emit("affineRicci","\\bar R_{"+(l+1)+(j+1)+"}",ar,st); }
      endSection("affineRicci",sec,{matrix:aRic});
    }
    if(want("curvature")) startSection("curvature","Nonlinear curvature","R^k{}_{ij}"); sec=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      if(want("curvature")) postStep("Computing and simplifying R^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); terms=[]; for(l=0;l<n;l++) terms.push(mul(AR[upper][l][i][j],y[l])); var rv=S(sum(terms)); R[upper][i][j]=rv; R[upper][j][i]=neg(rv);
      if(want("curvature")) emit("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv,st);
    }
    if(want("curvature")) endSection("curvature",sec);
  }else{
    if(want("curvature")) startSection("curvature","Nonlinear curvature","R^k{}_{ij}"); sec=performance.now();
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++) for(j=i+1;j<n;j++){
      if(want("curvature")) postStep("Computing and simplifying R^"+(upper+1)+"_"+(i+1)+(j+1)); st=performance.now(); var rv2=S(sub(horizontalDerivative(N[upper][j],i,x,y,N),horizontalDerivative(N[upper][i],j,x,y,N))); R[upper][i][j]=rv2; R[upper][j][i]=neg(rv2);
      if(want("curvature")) emit("curvature","R^{"+(upper+1)+"}{}_{"+(i+1)+(j+1)+"}",rv2,st);
    }
    if(want("curvature")) endSection("curvature",sec);
  }

  if(want("deviation")){
    startSection("deviation","Geodesic deviation tensor","R^k{}_i"); sec=performance.now(); var dev=[]; for(upper=0;upper<n;upper++) dev[upper]=new Array(n).fill("0");
    for(upper=0;upper<n;upper++) for(i=0;i<n;i++){ postStep("Computing and simplifying R^"+(upper+1)+"_"+(i+1)); st=performance.now(); terms=[]; for(j=0;j<n;j++) terms.push(mul(R[upper][i][j],y[j])); dev[upper][i]=S(sum(terms)); emit("deviation","R^{"+(upper+1)+"}{}_{"+(i+1)+"}",dev[upper][i],st); }
    endSection("deviation",sec,{matrix:dev});
  }
  if(want("ricci")){
    startSection("ricci","Finsler-Ricci quantities","Ric and R_{ij}"); sec=performance.now(); terms=[]; for(i=0;i<n;i++) for(j=0;j<n;j++) terms.push(mul(R[i][i][j],y[j])); var Ric=S(sum(terms));
    postStep("Computing and simplifying Ric"); st=performance.now(); emit("ricci","\\mathrm{Ric}",Ric,st);
    var Ricci=[]; for(i=0;i<n;i++) Ricci[i]=new Array(n).fill("0");
    for(i=0;i<n;i++) for(j=i;j<n;j++){ postStep("Computing and simplifying R_"+(i+1)+(j+1)); st=performance.now(); var rij=S(mul("0.5",D(D(Ric,y[i]),y[j]))); Ricci[i][j]=rij; Ricci[j][i]=rij; emit("ricci","R_{"+(i+1)+(j+1)+"}",rij,st); }
    endSection("ricci",sec,{matrix:Ricci});
  }
  postMessage({type:"done",totalMs:performance.now()-totalStart});
}

onmessage=function(event){
  if(!event.data||event.data.type!=="calculate") return;
  calculate(event.data).catch(function(error){ postMessage({type:"error",message:error&&error.message?error.message:String(error)}); });
};
