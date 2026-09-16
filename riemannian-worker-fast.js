"use strict";

/* Load the symbolic engine, then replace its expensive presentation-oriented
   final simplifier with a smaller canonicalization pass. */
importScripts("riemannian-worker.js?v=2");

var canonicalCache=Object.create(null);
var strongFinalSimplify=F;

S=function(expr){
  var text=raw(expr);if(simplifyCache[text]!==undefined)return simplifyCache[text];
  var out=text;try{out=math.simplify(text).toString({parenthesis:"auto"});}catch(e){}
  simplifyCache[text]=out;simplifyCache[out]=out;return out;
};

rationalizeAtomic=function(expr){
  var node=math.parse(raw(expr)),held=[],byKey=Object.create(null),prefix="__heldfn";
  node=node.transform(function(child){
    if(child&&child.isFunctionNode){
      var key=child.toString({parenthesis:"auto"}),index=byKey[key];
      if(index===undefined){index=held.length;byKey[key]=index;held.push(child);}
      return math.parse(prefix+index);
    }
    return child;
  });
  var candidate=math.rationalize(node);
  candidate=candidate.transform(function(child){
    if(child&&child.isSymbolNode&&child.name.indexOf(prefix)===0){var i=Number(child.name.slice(prefix.length));if(Number.isInteger(i)&&held[i])return held[i];}
    return child;
  });
  return candidate;
};

function trigCleanup(expr){
  try{
    return math.simplify(expr,[
      "sin(n1)^2 + cos(n1)^2 -> 1",
      "cos(n1)^2 + sin(n1)^2 -> 1",
      "1 - sin(n1)^2 -> cos(n1)^2",
      "1 - cos(n1)^2 -> sin(n1)^2",
      "sin(n1)^2 - 1 -> -cos(n1)^2",
      "cos(n1)^2 - 1 -> -sin(n1)^2"
    ]).toString({parenthesis:"auto"});
  }catch(e){return raw(expr);}
}

function C(expr){
  var base=S(expr),key=raw(base);if(canonicalCache[key]!==undefined)return canonicalCache[key];
  if(base==="0"||base==="0.0"||base==="-0"){canonicalCache[key]="0";return "0";}
  if(key.length>5000){canonicalCache[key]=base;return base;}
  var best=base;
  try{
    if(key.indexOf("__uf")!==-1&&key.length<1800){
      best=strongFinalSimplify(base);
    }else{
      best=S(rationalizeAtomic(base));
      best=S(trigCleanup(best));
      if(best.length<2500)best=S(rationalizeAtomic(best));
    }
  }catch(e){best=base;}
  best=S(best);
  canonicalCache[key]=best;canonicalCache[best]=best;return best;
}

var baseInverseMatrix=inverseMatrix;
inverseMatrix=function(matrix){var out=baseInverseMatrix(matrix);out.det=C(out.det);return out;};

christoffel=function(metric,inv,x){
  var n=metric.length,G=[],a,b,c,d;
  for(a=0;a<n;a++){G[a]=[];for(b=0;b<n;b++){G[a][b]=[];for(c=0;c<n;c++){
    var terms=[];for(d=0;d<n;d++){
      var bracket=add(add(D(metric[d][c],x[b]),D(metric[b][d],x[c])),neg(D(metric[b][c],x[d])));
      terms.push(mul(inv[a][d],bracket));
    }
    var value=S(mul("1/2",sum(terms)));
    G[a][b][c]=isZero(value)?"0":C(value);
  }}}
  return G;
};

christoffelOutput=function(G){
  var out=[],n=G.length;for(var a=0;a<n;a++)for(var b=0;b<n;b++)for(var c=b;c<n;c++){
    var v=G[a][b][c];if(!isZero(v))out.push({i:a,j:b,k:c,value:C(v)});
  }return out;
};

geodesicOutput=function(G){
  var n=G.length,out=[];for(var a=0;a<n;a++){
    var terms=[];for(var b=0;b<n;b++)for(var c=0;c<n;c++)if(!isZero(G[a][b][c]))terms.push(mul(mul(G[a][b][c],"v"+(b+1)),"v"+(c+1)));
    out.push({i:a,value:terms.length?C(sum(terms)):"0"});
  }return out;
};

ricciTensor=function(G,x){
  var n=G.length,R=[],s,v,a,l,terms,value,componentStart,rawValue;
  for(s=0;s<n;s++)R[s]=new Array(n).fill("0");
  for(s=0;s<n;s++)for(v=s;v<n;v++){
    componentStart=performance.now();
    postProgress("Ricci component R"+(s+1)+(v+1),"assembling");
    terms=[];
    for(a=0;a<n;a++){
      if(!isZero(G[a][v][s]))terms.push(D(G[a][v][s],x[a]));
      if(!isZero(G[a][a][s]))terms.push(neg(D(G[a][a][s],x[v])));
      for(l=0;l<n;l++){
        if(!isZero(G[a][a][l])&&!isZero(G[l][v][s]))terms.push(mul(G[a][a][l],G[l][v][s]));
        if(!isZero(G[a][v][l])&&!isZero(G[l][a][s]))terms.push(neg(mul(G[a][v][l],G[l][a][s])));
      }
    }
    rawValue=terms.length?S(sum(terms)):"0";
    postProgress("Ricci component R"+(s+1)+(v+1),"simplifying · raw length "+rawValue.length);
    value=isZero(rawValue)?"0":C(rawValue);
    postProgress("Ricci component R"+(s+1)+(v+1),"done in "+Math.round(performance.now()-componentStart)+" ms");
    R[s][v]=value;R[v][s]=value;
  }
  return R;
};

ricciScalar=function(ricci,inv){
  var terms=[];for(var i=0;i<ricci.length;i++)for(var j=0;j<ricci.length;j++)if(!isZero(ricci[i][j])&&!isZero(inv[i][j]))terms.push(mul(inv[i][j],ricci[i][j]));
  return terms.length?C(sum(terms)):"0";
};

einsteinTensor=function(ricci,scalar,metric){
  var n=metric.length,out=[],i,j,value;for(i=0;i<n;i++)out[i]=new Array(n).fill("0");
  if(isZero(scalar)){for(i=0;i<n;i++)for(j=i;j<n;j++){value=C(ricci[i][j]);out[i][j]=value;out[j][i]=value;}return out;}
  for(i=0;i<n;i++)for(j=i;j<n;j++){
    value=C(sub(ricci[i][j],mul("1/2",mul(scalar,metric[i][j]))));out[i][j]=value;out[j][i]=value;
  }
  return out;
};

var baseRiemannOutput=riemannOutput;
riemannOutput=function(G,x){
  return baseRiemannOutput(G,x).map(function(c){c.value=C(c.value);return c;}).filter(function(c){return !isZero(c.value);});
};
