"use strict";

/*
 * Public v4 worker entry point.
 *
 * The verified geometry/simplification stack lives in finsler-worker-v4-core.js.
 * In every affine/Berwald path there is an exact identity
 *
 *   Ric(x,y) = Rbar_ij(x) y^i y^j.
 *
 * The Finsler Ricci tensor is therefore the fiber Hessian of that quadratic
 * form, i.e. the symmetric part of Rbar_ij (and exactly Rbar_ij for the
 * Levi-Civita cases used by pseudo-Riemannian inputs).  Use the already strongly
 * simplified affine Ricci components as the computational source for the later
 * Ricci section.  This prevents separate algebraic routes from disagreeing and
 * avoids redoing an expensive curvature contraction/Hessian calculation.
 */
importScripts("finsler-worker-v4-core.js?v=1");

var finslerRicciBaseOnMessage=onmessage;
var finslerRicciBasePost=self.postMessage.bind(self);
var finslerRicciState=null;

function finslerRicciStrong(value){
  var text=String(value==null?"0":value);
  try{
    if(typeof finslerStrongPS==="function")text=finslerStrongPS(text);
    else text=S(text);
  }catch(e){}
  return text;
}
function finslerRicciMatrix(n){
  var out=[];
  for(var i=0;i<n;i++)out[i]=new Array(n).fill(null);
  return out;
}
function finslerRicciZeroLike(value){
  var t=finslerRicciStrong(value).replace(/\s+/g,"");
  return t==="0"||t==="0.0"||t==="-0";
}
function finslerRicciCapture(message){
  var s=finslerRicciState;
  if(!s||!message||message.type!=="component"||message.section!=="affineRicci")return;
  var m=/\\bar R_\{(\d+)(\d+)\}/.exec(String(message.label||""));
  if(!m)return;
  var i=Number(m[1])-1,j=Number(m[2])-1;
  if(i<0||j<0||i>=s.n||j>=s.n)return;
  s.affineRicci[i][j]=finslerRicciStrong(message.value);
}
function finslerRicciReady(){
  var s=finslerRicciState;
  if(!s)return false;
  for(var i=0;i<s.n;i++)for(var j=0;j<s.n;j++)if(s.affineRicci[i][j]===null)return false;
  return true;
}
function finslerRicciSymmetricEntry(a,b){
  if(a===b)return finslerRicciStrong(a);
  return finslerRicciStrong(S(mul("0.5",add(a,b))));
}
function finslerRicciSend(message){
  return finslerRicciBasePost(message);
}
function finslerRicciSynthesize(){
  var s=finslerRicciState;
  if(!s||!s.wantsRicci||s.synthesized||!finslerRicciReady())return;
  s.synthesized=true;

  /* The base calculate() checks want("ricci") only after the affine Ricci
     section. Turn that old duplicate route off before execution reaches it. */
  if(typeof activeOutputs==="object"&&activeOutputs)activeOutputs.ricci=false;

  var start=performance.now(),terms=[];
  for(var i=0;i<s.n;i++)for(var j=0;j<s.n;j++){
    terms.push(mul(mul(s.affineRicci[i][j],"y"+(i+1)),"y"+(j+1)));
  }
  var Ric=finslerRicciStrong(S(sum(terms)));
  var matrix=[];
  for(i=0;i<s.n;i++)matrix[i]=new Array(s.n).fill("0");

  finslerRicciSend({type:"sectionStart",section:"ricci",title:"Finsler-Ricci quantities",meta:"Ric and R_{ij}"});
  finslerRicciSend({type:"stepStart",label:"Computing Ric from affine Ricci"});
  finslerRicciSend({type:"component",section:"ricci",label:"\\mathrm{Ric}",value:Ric,elapsedMs:performance.now()-start});

  for(i=0;i<s.n;i++)for(j=i;j<s.n;j++){
    var st=performance.now();
    var rij=finslerRicciSymmetricEntry(s.affineRicci[i][j],s.affineRicci[j][i]);
    matrix[i][j]=rij;matrix[j][i]=rij;
    finslerRicciSend({type:"stepStart",label:"Reading R_"+(i+1)+(j+1)+" from affine Ricci"});
    finslerRicciSend({type:"component",section:"ricci",label:"R_{"+(i+1)+(j+1)+"}",value:rij,elapsedMs:performance.now()-st});
  }
  finslerRicciSend({type:"sectionComplete",section:"ricci",elapsedMs:performance.now()-start,summary:{matrix:matrix}});
}

self.postMessage=function(message,transfer){
  var s=finslerRicciState;
  if(s&&message){
    if(message.type==="component"&&message.section==="affineRicci")finslerRicciCapture(message);

    if(message.type==="sectionComplete"&&message.section==="affineRicci"){
      /* Preserve user-requested affine output ordering: finish that card first,
         then produce the dependent Finsler-Ricci card. Internally forced affine
         sections remain hidden. */
      if(!s.forcedAffine){
        if(transfer!==undefined)finslerRicciBasePost(message,transfer);else finslerRicciBasePost(message);
      }
      finslerRicciSynthesize();
      return;
    }

    if(s.forcedAffine&&(message.section==="affineCurvature"||message.section==="affineRicci"))return;

    /* If an imported/base implementation ever reaches its old Ricci route
       despite the activeOutputs switch, discard it rather than emit duplicates. */
    if(s.synthesized&&message.section==="ricci")return;
  }
  if(transfer!==undefined)return finslerRicciBasePost(message,transfer);
  return finslerRicciBasePost(message);
};

onmessage=function(event){
  var data=event&&event.data?event.data:{};
  if(data.type!=="calculate")return finslerRicciBaseOnMessage(event);

  var outputs=Object.assign({},data.outputs||{}),wantsRicci=outputs.ricci===true;
  var userAffine=outputs.affine===true;
  finslerRicciState={
    n:Number(data.n)||0,
    affineRicci:finslerRicciMatrix(Number(data.n)||0),
    forcedAffine:wantsRicci&&!userAffine,
    wantsRicci:wantsRicci,
    synthesized:false
  };

  /* For an affine/Berwald calculation Ric already depends on the same affine
     curvature. If the affine cards were not selected, request them internally
     so Rbar_ij is available as the exact computational source, then suppress
     those extra cards in the message wrapper above. Non-affine Finsler paths
     never emit affineRicci and therefore continue through the generic Ricci
     calculation unchanged. */
  if(finslerRicciState.forcedAffine)outputs.affine=true;
  var forwarded=Object.assign({},data,{outputs:outputs});
  return finslerRicciBaseOnMessage({data:forwarded});
};
