"use strict";

/* Fast symbolic layer for curvature calculations.
   math.js remains responsible for parsing and differentiation; Algebrite is
   used only as a bounded final canonicalizer for rational cancellation. */
importScripts("riemannian-worker.js?v=2");
importScripts("https://unpkg.com/algebrite@1.4.0/dist/algebrite.bundle-for-browser.js");

var canonicalCache=Object.create(null);

S=function(expr){
  var text=raw(expr);if(simplifyCache[text]!==undefined)return simplifyCache[text];
  var out=text;try{out=math.simplify(text).toString({parenthesis:"auto"});}catch(e){}
  simplifyCache[text]=out;simplifyCache[out]=out;return out;
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

function normalizeCasSyntax(text){
  return String(text)
    .replace(/\*\s*-\s*1\b/g,"*(-1)")
    .replace(/\/\s*-\s*1\b/g,"/(-1)");
}

function protectCustomAtoms(text){
  var originals=[],byToken=Object.create(null);
  var protectedText=String(text).replace(/__uf\d+(?:_d\d+(?:_\d+)*)?/g,function(token){
    if(byToken[token]!==undefined)return "casatom"+byToken[token];
    var index=originals.length;originals.push(token);byToken[token]=index;return "casatom"+index;
  });
  return {text:protectedText,originals:originals};
}

function restoreCustomAtoms(text,originals){
  return String(text).replace(/\bcasatom(\d+)\b/g,function(_,index){return originals[Number(index)]||_;});
}

function expressionScore(text){
  var s=String(text),ops=0;try{math.parse(s).traverse(function(node){if(node&&node.isOperatorNode)ops++;});}catch(e){}
  return ops*20+s.replace(/\s+/g,"").length;
}

/* Canonicalize only bounded expressions.  This deliberately avoids
   math.rationalize(), which can become combinatorial even on compact GR
   expressions such as Schwarzschild R_rr. */
function C(expr,factor){
  var base=S(expr),mode=factor?"f\u0000":"s\u0000",key=mode+base;
  if(canonicalCache[key]!==undefined)return canonicalCache[key];
  if(isZero(base)){canonicalCache[key]="0";return "0";}
  if(base.length>6000||typeof Algebrite==="undefined"){
    var fallback=S(trigCleanup(base));canonicalCache[key]=fallback;return fallback;
  }

  var best=base,bestScore=expressionScore(base);
  try{
    var cleaned=S(trigCleanup(base));
    var held=protectCustomAtoms(cleaned);
    var casInput=normalizeCasSyntax(held.text);
    var simplified=Algebrite.simplify(casInput).toString();
    var candidate=restoreCustomAtoms(simplified,held.originals);
    candidate=S(candidate);
    if(isZero(candidate)){canonicalCache[key]="0";return "0";}

    var score=expressionScore(candidate);
    if(score<bestScore){best=candidate;bestScore=score;}

    if(factor&&simplified.length<3000){
      var factored=Algebrite.factor(simplified).toString();
      var factorCandidate=S(restoreCustomAtoms(factored,held.originals));
      var factorScore=expressionScore(factorCandidate);
      if(factorScore<bestScore){best=factorCandidate;bestScore=factorScore;}
    }
  }catch(e){
    var trig=S(trigCleanup(base)),trigScore=expressionScore(trig);
    if(trigScore<bestScore)best=trig;
  }
  canonicalCache[key]=best;return best;
}

var baseInverseMatrix=inverseMatrix;
inverseMatrix=function(matrix){
  var out=baseInverseMatrix(matrix),n=out.matrix.length;
  out.det=C(out.det,true);
  for(var i=0;i<n;i++)for(var j=0;j<n;j++)if(!isZero(out.matrix[i][j]))out.matrix[i][j]=C(out.matrix[i][j],false);
  return out;
};

christoffel=function(metric,inv,x){
  var n=metric.length,G=[],a,b,c,d;
  for(a=0;a<n;a++){G[a]=[];for(b=0;b<n;b++){G[a][b]=[];for(c=0;c<n;c++){
    var terms=[];for(d=0;d<n;d++){
      var bracket=add(add(D(metric[d][c],x[b]),D(metric[b][d],x[c])),neg(D(metric[b][c],x[d])));
      terms.push(mul(inv[a][d],bracket));
    }
    var value=S(mul("1/2",sum(terms)));
    G[a][b][c]=isZero(value)?"0":C(value,false);
  }}}
  return G;
};

christoffelOutput=function(G){
  var out=[],n=G.length;for(var a=0;a<n;a++)for(var b=0;b<n;b++)for(var c=b;c<n;c++){
    var v=G[a][b][c];if(!isZero(v))out.push({i:a,j:b,k:c,value:v});
  }return out;
};

geodesicOutput=function(G){
  var n=G.length,out=[];for(var a=0;a<n;a++){
    var terms=[];for(var b=0;b<n;b++)for(var c=0;c<n;c++)if(!isZero(G[a][b][c]))terms.push(mul(mul(G[a][b][c],"v"+(b+1)),"v"+(c+1)));
    out.push({i:a,value:terms.length?C(sum(terms),true):"0"});
  }return out;
};

ricciTensor=function(G,x){
  var n=G.length,R=[],s,v,a,l,terms,value,rawValue;
  for(s=0;s<n;s++)R[s]=new Array(n).fill("0");
  for(s=0;s<n;s++)for(v=s;v<n;v++){
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
    value=isZero(rawValue)?"0":C(rawValue,true);
    R[s][v]=value;R[v][s]=value;
  }
  return R;
};

ricciScalar=function(ricci,inv){
  var terms=[];for(var i=0;i<ricci.length;i++)for(var j=0;j<ricci.length;j++)if(!isZero(ricci[i][j])&&!isZero(inv[i][j]))terms.push(mul(inv[i][j],ricci[i][j]));
  return terms.length?C(sum(terms),true):"0";
};

einsteinTensor=function(ricci,scalar,metric){
  var n=metric.length,out=[],i,j,value;for(i=0;i<n;i++)out[i]=new Array(n).fill("0");
  if(isZero(scalar)){
    for(i=0;i<n;i++)for(j=i;j<n;j++){value=C(ricci[i][j],true);out[i][j]=value;out[j][i]=value;}
    return out;
  }
  for(i=0;i<n;i++)for(j=i;j<n;j++){
    value=C(sub(ricci[i][j],mul("1/2",mul(scalar,metric[i][j]))),true);out[i][j]=value;out[j][i]=value;
  }
  return out;
};

var baseRiemannOutput=riemannOutput;
riemannOutput=function(G,x){
  return baseRiemannOutput(G,x).map(function(component){
    component.value=C(component.value,false);return component;
  }).filter(function(component){return !isZero(component.value);});
};

var baseOnMessage=onmessage;
onmessage=function(event){canonicalCache=Object.create(null);return baseOnMessage(event);};
