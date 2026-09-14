"use strict";

importScripts("finsler-worker-v3.js?v=1");

var finslerBaseOnMessage = onmessage;
var finslerNativeD = D;
var finslerFunctionInfo = Object.create(null);
var finslerBaseByKey = Object.create(null);

function finslerResetFunctions(defs){
  finslerFunctionInfo = Object.create(null);
  finslerBaseByKey = Object.create(null);
  (defs || []).forEach(function(def){
    var info = {
      token:def.token,
      baseToken:def.token,
      name:def.name,
      args:(def.args||[]).slice(),
      multi:[],
      argLabels:(def.argLabels||[]).slice()
    };
    finslerFunctionInfo[info.token]=info;
    finslerBaseByKey[info.name+"\u0000"+info.args.join("\u0001")]=info;
  });
}

function finslerCollectSymbols(node){
  var found=Object.create(null), out=[];
  node.traverse(function(child){
    if(child && child.isSymbolNode && finslerFunctionInfo[child.name] && !found[child.name]){
      found[child.name]=true;
      out.push(child.name);
    }
  });
  return out;
}

function finslerDerivativeToken(info,argIndex){
  var multi=info.multi.slice();
  multi.push(argIndex+1);
  multi.sort(function(a,b){return a-b;});
  var token=info.baseToken+"_d"+multi.join("_");
  if(!finslerFunctionInfo[token]){
    finslerFunctionInfo[token]={
      token:token,
      baseToken:info.baseToken,
      name:info.name,
      args:info.args.slice(),
      multi:multi,
      argLabels:info.argLabels.slice()
    };
  }
  return token;
}

function finslerFindBase(name,args){
  return finslerBaseByKey[name+"\u0000"+args.join("\u0001")] || null;
}

function finslerTokenDerivative(info,variable){
  var terms=[];
  var baseInfo=finslerFunctionInfo[info.baseToken] || info;

  /* Known Bessel identities used by Catalogue §2.6 and §2.11. */
  if(info.multi.length===0 && info.args.length===1 && (info.name==="J0" || info.name==="J1")){
    var darg=finslerNativeD(info.args[0],variable);
    if(isZero(darg)) return "0";
    var mate=finslerFindBase(info.name==="J0"?"J1":"J0",info.args);
    if(mate){
      if(info.name==="J0") return S(mul(neg(mate.token),darg));
      return S(mul(sub(mate.token,div(info.token,info.args[0])),darg));
    }
  }

  for(var j=0;j<info.args.length;j++){
    var da=finslerNativeD(info.args[j],variable);
    if(isZero(da)) continue;
    terms.push(mul(finslerDerivativeToken(baseInfo,j),da));
  }
  return terms.length ? S(sum(terms)) : "0";
}

D=function(expr,variable){
  var text=raw(expr);
  if(!Object.keys(finslerFunctionInfo).length) return finslerNativeD(text,variable);
  var key="custom\u0000"+variable+"\u0000"+text;
  if(derivativeCache[key]!==undefined) return derivativeCache[key];

  var node=math.parse(text);
  var pieces=[];
  try{
    pieces.push(math.derivative(node,variable,{simplify:false}).toString({parenthesis:"auto"}));
  }catch(e){
    pieces.push(math.derivative(node,variable).toString({parenthesis:"auto"}));
  }

  var symbols=finslerCollectSymbols(node);
  for(var s=0;s<symbols.length;s++){
    var token=symbols[s], partial;
    try{
      partial=math.derivative(node,token,{simplify:false}).toString({parenthesis:"auto"});
    }catch(e2){
      partial=math.derivative(node,token).toString({parenthesis:"auto"});
    }
    if(isZero(partial)) continue;
    var dt=finslerTokenDerivative(finslerFunctionInfo[token],variable);
    if(isZero(dt)) continue;
    pieces.push(mul(partial,dt));
  }

  var value=S(sum(pieces));
  derivativeCache[key]=value;
  return value;
};

onmessage=function(event){
  var data=event.data||{};
  if(data.type!=="calculate") return;
  finslerResetFunctions(data.symbolicFunctions||[]);
  derivativeCache=Object.create(null);
  finslerBaseOnMessage(event);
};