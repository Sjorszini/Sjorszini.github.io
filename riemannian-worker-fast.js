"use strict";

/* Load the full symbolic engine, then replace only the expensive final
   simplification path. Ordinary coordinate metrics such as Schwarzschild do
   not benefit from rationalization on every Ricci component. */
importScripts("riemannian-worker.js?v=2");

S=function(expr){
  var text=raw(expr);if(simplifyCache[text]!==undefined)return simplifyCache[text];
  var out=text;try{out=math.simplify(text).toString({parenthesis:"auto"});}catch(e){}
  simplifyCache[text]=out;simplifyCache[out]=out;return out;
};

var strongFinalSimplify=F;
F=function(expr){
  var base=S(expr),text=raw(base);
  if(finalSimplifyCache[text]!==undefined)return finalSimplifyCache[text];
  if(text.indexOf("__uf")===-1||text.length>1400){finalSimplifyCache[text]=base;return base;}
  return strongFinalSimplify(base);
};

ricciTensor=function(G,x){
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
    R[s][v]=S(sum(terms));
  }}
  return R;
};
