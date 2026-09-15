"use strict";

/*
 * Symbolic-function chain-rule correction for the public v4 worker.
 *
 * The stable symbolic derivative hook correctly knows how to differentiate a
 * function token through its declared arguments via finslerTokenDerivative(),
 * but one call site accidentally fed the coordinate/fiber variable name into
 * finslerDerivativeToken() as though it were an argument index.  As a result,
 * a profile such as a(t) could look spuriously y-dependent during metric input
 * validation (for example FLRW g_22).
 */
importScripts("finsler-worker-v4.js?v=5");

D=function(expr,variable){
  if(!Object.keys(finslerFunctionInfo).length)return finslerBaseD(expr,variable);
  var text=raw(expr),key="chainfix\u0000"+variable+"\u0000"+text;
  if(derivativeCache[key]!==undefined)return derivativeCache[key];
  var node=math.parse(text),pieces=[];
  try{pieces.push(finslerDerivative(node,variable,{simplify:false}).toString({parenthesis:"auto"}));}
  catch(e){pieces.push(finslerDerivative(node,variable).toString({parenthesis:"auto"}));}
  var symbols=finslerCollectFunctionSymbols(node);
  for(var s=0;s<symbols.length;s++){
    var token=symbols[s],partial;
    try{partial=finslerDerivative(node,token,{simplify:false}).toString({parenthesis:"auto"});}
    catch(e2){partial=finslerDerivative(node,token).toString({parenthesis:"auto"});}
    if(isZero(partial))continue;
    var dt=finslerTokenDerivative(finslerFunctionInfo[token],variable);
    if(isZero(dt))continue;
    pieces.push(mul(partial,dt));
  }
  var value=S(sum(pieces));derivativeCache[key]=value;return value;
};
