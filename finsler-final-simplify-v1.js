(function(){
  "use strict";

  if(!window.math || !window.Worker || window.Worker.__finslerFinalSimplify) return;

  var RealWorker=window.Worker;
  var simplifyCache=Object.create(null);

  function realSimplifyNode(expr){
    var simplify=(math.__finslerUiOriginalSimplify||math.simplify).bind(math);
    try{return simplify(expr);}catch(e){return typeof expr==="string"?math.parse(expr):expr;}
  }

  function nodeText(node){
    try{return node.toString({parenthesis:"auto"});}catch(e){return String(node);}
  }

  function compactLength(text){return String(text).replace(/\s+/g,"").length;}

  function rationalizeWithOpaqueFunctions(expr){
    var node;
    try{node=math.parse(String(expr));}catch(e){return null;}

    var byText=Object.create(null),byToken=Object.create(null),counter=0;
    node=node.transform(function(child){
      if(!child || !child.isFunctionNode) return child;
      var text=nodeText(child),token=byText[text];
      if(!token){
        token="__fs_atom_"+(counter++);
        byText[text]=token;
        byToken[token]=text;
      }
      return math.parse(token);
    });

    var rational;
    try{rational=math.rationalize(node);}catch(e2){return null;}

    rational=rational.transform(function(child){
      if(child&&child.isSymbolNode&&byToken[child.name]){
        try{return math.parse(byToken[child.name]);}catch(e3){}
      }
      return child;
    });

    try{return nodeText(realSimplifyNode(rational));}catch(e4){return nodeText(rational);}
  }

  function finalExpression(expr){
    if(expr===undefined||expr===null)return expr;
    var original=String(expr);
    if(simplifyCache[original]!==undefined)return simplifyCache[original];

    var best=original,current=original;
    for(var i=0;i<5;i++){
      var next;
      try{next=nodeText(realSimplifyNode(current));}catch(e){break;}
      if(compactLength(next)<compactLength(best))best=next;
      if(next===current)break;
      current=next;
    }

    var rational=rationalizeWithOpaqueFunctions(best);
    if(rational&&compactLength(rational)<compactLength(best))best=rational;

    /* A second simplify/rationalize cycle catches forms exposed by the first
       cancellation, e.g. nested Schwarzschild fractions. */
    try{
      var simplified=nodeText(realSimplifyNode(best));
      if(compactLength(simplified)<compactLength(best))best=simplified;
    }catch(e2){}
    rational=rationalizeWithOpaqueFunctions(best);
    if(rational&&compactLength(rational)<compactLength(best))best=rational;

    simplifyCache[original]=best;
    return best;
  }

  function finalTree(value){
    if(typeof value==="string")return finalExpression(value);
    if(Array.isArray(value))return value.map(finalTree);
    if(value&&typeof value==="object"){
      var out={};
      Object.keys(value).forEach(function(key){out[key]=finalTree(value[key]);});
      return out;
    }
    return value;
  }

  function simplifyMessage(data){
    if(!data||typeof data!=="object")return data;
    if(data.type==="component"&&typeof data.value==="string"){
      return Object.assign({},data,{value:finalExpression(data.value)});
    }
    if(data.type==="sectionComplete"&&data.summary){
      return Object.assign({},data,{summary:finalTree(data.summary)});
    }
    return data;
  }

  function FinalWorker(url,options){
    var native=new RealWorker(url,options),self=this;
    this._native=native;
    this._onmessage=null;
    this._onerror=null;
    native.onmessage=function(event){
      if(self._onmessage)self._onmessage.call(self,{data:simplifyMessage(event.data)});
    };
    native.onerror=function(event){if(self._onerror)self._onerror.call(self,event);};
  }
  FinalWorker.prototype.postMessage=function(data,transfer){return this._native.postMessage(data,transfer||[]);};
  FinalWorker.prototype.terminate=function(){return this._native.terminate();};
  Object.defineProperty(FinalWorker.prototype,"onmessage",{get:function(){return this._onmessage;},set:function(fn){this._onmessage=fn;}});
  Object.defineProperty(FinalWorker.prototype,"onerror",{get:function(){return this._onerror;},set:function(fn){this._onerror=fn;}});

  FinalWorker.__finslerFinalSimplify=true;
  window.Worker=FinalWorker;
  window.FINSLER_FINAL_SIMPLIFY=finalExpression;
})();
