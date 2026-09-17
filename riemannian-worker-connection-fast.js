"use strict";

importScripts("riemannian-worker.js?v=4");

/* Sparse/symmetric Levi-Civita fast path.
   This is generic: it uses only metric/inverse sparsity and Γ^a_bc = Γ^a_cb. */
christoffel=function(metric,inv,x){
  var n=metric.length,G=[],dg=[],invNZ=[],a,b,c,d,i,j,k;

  /* Derivatives of metric entries are reused throughout the connection. */
  for(i=0;i<n;i++){
    dg[i]=[];
    for(j=0;j<n;j++){
      dg[i][j]=new Array(n).fill("0");
      if(isZero(metric[i][j]))continue;
      for(k=0;k<n;k++)dg[i][j][k]=D(metric[i][j],x[k]);
    }
  }

  /* Most physically useful coordinate metrics have a sparse inverse. */
  for(a=0;a<n;a++){
    invNZ[a]=[];
    for(d=0;d<n;d++)if(!isZero(inv[a][d]))invNZ[a].push(d);
  }

  for(a=0;a<n;a++){
    G[a]=[];
    for(b=0;b<n;b++)G[a][b]=new Array(n).fill("0");
  }

  /* Compute only the independent lower-index half and mirror it.
     Keep the calculation form light; displayed Christoffels are polished later
     by the existing presentation serializer, while curvature quantities have
     their own exact canonicalization at contraction time. */
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
    G[a][b][c]=value;
    G[a][c][b]=value;
  }
  return G;
};
