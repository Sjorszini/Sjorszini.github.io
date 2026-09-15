"use strict";

/*
 * Public v4 worker entry point.
 *
 * The verified geometry/simplification stack lives in finsler-worker-v4-core.js.
 * This thin guard enforces an exact invariant of the affine/Berwald path:
 *
 *   Ric(x,y) = Rbar_ij(x) y^i y^j.
 *
 * Therefore, if every affine Ricci component reduces to zero, the Finsler Ricci
 * scalar and its fiber Hessian must also be identically zero.  Older revisions
 * simplified the two output sections independently and could display the
 * impossible combination Rbar_ij=0 but Ric!=0.
 */
importScripts("finsler-worker-v4-core.js?v=1");

var finslerRicciBaseOnMessage=onmessage;
var finslerRicciBasePost=self.postMessage.bind(self);
var finslerRicciState=null;

function finslerRicciCompactZero(value){
  var text=String(value==null?"":value);
  try{if(typeof finslerStrongPS==="function")text=finslerStrongPS(text);else text=S(text);}catch(e){}
  text=text.replace(/\s+/g,"");
  return text==="0"||text==="0.0"||text==="-0";
}
function finslerRicciZeroMatrix(n){
  var out=[];
  for(var i=0;i<n;i++)out[i]=new Array(n).fill("0");
  return out;
}
function finslerRicciCapture(message){
  var s=finslerRicciState;
  if(!s||!message||message.type!=="component"||message.section!=="affineRicci")return;
  var value=String(message.value);
  try{if(typeof finslerStrongPS==="function")value=finslerStrongPS(value);}catch(e){}
  if(s.affineRicci.length<s.n*s.n)s.affineRicci.push(value);
}
function finslerRicciFinishAffine(){
  var s=finslerRicciState;
  if(!s||s.affineRicci.length!==s.n*s.n)return;
  s.affineVacuum=s.affineRicci.every(finslerRicciCompactZero);
}

self.postMessage=function(message,transfer){
  var s=finslerRicciState,outgoing=message;
  if(s&&message){
    finslerRicciCapture(message);
    if(message.type==="sectionComplete"&&message.section==="affineRicci")finslerRicciFinishAffine();

    /* When affine output was enabled only as an internal prerequisite for the
       Ricci consistency check, keep those extra sections out of the UI. */
    if(s.forcedAffine&&(message.section==="affineCurvature"||message.section==="affineRicci"))return;

    if(s.affineVacuum&&message.section==="ricci"){
      if(message.type==="component"&&typeof message.value==="string"){
        outgoing=Object.assign({},message,{value:"0"});
      }else if(message.type==="sectionComplete"){
        var summary=message.summary?Object.assign({},message.summary):{};
        summary.matrix=finslerRicciZeroMatrix(s.n);
        outgoing=Object.assign({},message,{summary:summary});
      }
    }
  }
  if(transfer!==undefined)return finslerRicciBasePost(outgoing,transfer);
  return finslerRicciBasePost(outgoing);
};

onmessage=function(event){
  var data=event&&event.data?event.data:{};
  if(data.type!=="calculate")return finslerRicciBaseOnMessage(event);

  var outputs=Object.assign({},data.outputs||{}),wantsRicci=outputs.ricci===true;
  var userAffine=outputs.affine===true;
  finslerRicciState={
    n:Number(data.n)||0,
    affineRicci:[],
    affineVacuum:false,
    forcedAffine:wantsRicci&&!userAffine
  };

  /* Computing Ric already requires the affine curvature in this path.  When
     the user did not request the affine cards, request them internally so the
     exact contraction invariant can still be checked, then suppress them above. */
  if(finslerRicciState.forcedAffine)outputs.affine=true;
  var forwarded=Object.assign({},data,{outputs:outputs});
  return finslerRicciBaseOnMessage({data:forwarded});
};
