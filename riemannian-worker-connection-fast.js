"use strict";

importScripts("riemannian-worker.js?v=4");

var connectionNeedsCurvature=false;
var importedOnMessage=onmessage;
onmessage=function(event){
  var outputs=event&&event.data&&event.data.outputs||{};
  connectionNeedsCurvature=!!(outputs.riemann||outputs.ricci||outputs.scalar||outputs.einstein);
  return importedOnMessage(event);
};

function metricDependsOn(expr,variable){
  if(expr==="0")return false;
  try{
    var found=false;
    math.parse(expr).traverse(function(node){if(node&&node.isSymbolNode&&node.name===variable)found=true;});
    return found;
  }catch(e){return true;}
}

/* Sparse/symmetric Levi-Civita fast path.
   Generic optimizations only: cached metric derivatives, sparse inverse support,
   lower-index symmetry, and a lighter rational normalization for function-free
   curvature work. Custom symbolic functions retain the ordinary simplifier. */
christoffel=function(metric,inv,x){
  var n=metric.length,G=[],dg=[],invNZ=[],a,b,c,d,i,j,k;
  var hasSymbolicFunctions=Object.keys(functionInfo).length>0;

  for(i=0;i<n;i++){
    dg[i]=[];
    for(j=0;j<n;j++){
      dg[i][j]=new Array(n).fill("0");
      if(isZero(metric[i][j]))continue;
      for(k=0;k<n;k++)if(metricDependsOn(metric[i][j],x[k]))dg[i][j][k]=D(metric[i][j],x[k]);
    }
  }

  for(a=0;a<n;a++){
    invNZ[a]=[];
    for(d=0;d<n;d++)if(!isZero(inv[a][d]))invNZ[a].push(d);
  }

  for(a=0;a<n;a++){
    G[a]=[];
    for(b=0;b<n;b++)G[a][b]=new Array(n).fill("0");
  }

  for(a=0;a<n;a++)for(b=0;b<n;b++)for(c=b;c<n;c++){
    var terms=[];
    for(var q=0;q<invNZ[a].length;q++){
      d=invNZ[a][q];
      var bracketTerms=[];
      var p1=dg[d][c][b],p2=dg[b][d][c],p3=dg[b][c][d];
      if(p1!=="0")bracketTerms.push(p1);
      if(p2!=="0")bracketTerms.push(p2);
      if(p3!=="0")bracketTerms.push(neg(p3));
      if(!bracketTerms.length)continue;
      terms.push(mul(inv[a][d],sum(bracketTerms)));
    }
    var value=terms.length?S(mul("1/2",sum(terms))):"0";
    if(value!=="0"&&isZero(value))value="0";
    else if(value!=="0"&&connectionNeedsCurvature&&!hasSymbolicFunctions)value=F(value);
    G[a][b][c]=value;
    G[a][c][b]=value;
  }
  return G;
};
