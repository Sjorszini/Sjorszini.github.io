(function(){
  "use strict";
  var HASH_KEY="finsler",restoring=false;
  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function fire(node,type){if(node)node.dispatchEvent(new Event(type,{bubbles:true}));}
  function currentHashState(){var m=new RegExp('(?:^|[&#])'+HASH_KEY+'=([^&]+)').exec(location.hash.replace(/^#/,''));return m?m[1]:null;}
  function encodeState(obj){var json=JSON.stringify(obj),bytes=unescape(encodeURIComponent(json));return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decodeState(text){var s=String(text||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return JSON.parse(decodeURIComponent(escape(atob(s))));}
  function grid(){var n=Number(el('dimension').value),out=[];for(var i=0;i<n;i++){out[i]=[];for(var j=0;j<n;j++){var x=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');out[i][j]=x?x.value:'0';}}return out;}
  function oneForm(){var out=[];qa('.oneform-entry').forEach(function(n){out[Number(n.dataset.i)]=n.value;});return out;}
  function catalogueEntry(){
    var note=el('exampleNote'),text=note?note.textContent:'';if(!text)return null;
    var items=window.FINSLER_METRIC_CATALOGUE||[];
    for(var i=0;i<items.length;i++)if(text.indexOf(items[i].title+' ·')===0)return items[i];
    return null;
  }
  function expand(expr,defs){
    if(!window.math||!defs||!Object.keys(defs).length)return String(expr);
    var text=String(expr);
    for(var pass=0;pass<8;pass++){
      var changed=false;
      try{text=math.parse(text).transform(function(child){if(child&&child.isSymbolNode&&Object.prototype.hasOwnProperty.call(defs,child.name)){changed=true;return math.parse('('+defs[child.name]+')');}return child;}).toString({parenthesis:'auto'});}catch(e){return String(expr);}
      if(!changed)break;
    }
    return text;
  }
  function snapshot(){
    var metric=grid(),entry=catalogueEntry(),defs=entry&&entry.definitions?entry.definitions:null;
    if(defs)metric=metric.map(function(row){return row.map(function(x){return expand(x,defs);});});
    var input=document.querySelector('input[name="inputMode"]:checked'),geometry=document.querySelector('input[name="geometryMode"]:checked'),outputs={};
    qa('[data-output]').forEach(function(n){outputs[n.dataset.output]=!!n.checked;});
    return {v:1,dimension:Number(el('dimension').value),coords:qa('.coordinate-input').map(function(n){return n.value;}),inputMode:input?input.value:'metric',geometryMode:geometry?geometry.value:'riemannian',lagrangian:el('lagrangian')?el('lagrangian').value:'',metric:metric,oneForm:oneForm(),alphaBetaType:el('alphaBetaType')?el('alphaBetaType').value:'randers',m:el('mParameter')?el('mParameter').value:'1',constants:el('constantsInput')?el('constantsInput').value:'',functions:el('functionsInput')?el('functionsInput').value:'',outputs:outputs};
  }
  function setStatus(text,type){var n=el('status');if(n){n.textContent=text;n.className='calc-status'+(type?' is-'+type:'');}}
  function restore(state){
    if(!state||state.v!==1)return false;restoring=true;
    try{
      var d=Math.max(2,Math.min(4,Number(state.dimension)||4)),dim=el('dimension');dim.value=String(d);fire(dim,'change');
      setTimeout(function(){
        try{
          var coordInputs=qa('.coordinate-input');(state.coords||[]).slice(0,d).forEach(function(v,i){if(coordInputs[i]){coordInputs[i].value=String(v);fire(coordInputs[i],'change');}});
          var im=document.querySelector('input[name="inputMode"][value="'+(state.inputMode==='lagrangian'?'lagrangian':'metric')+'"]');if(im){im.checked=true;fire(im,'change');}
          var gm=document.querySelector('input[name="geometryMode"][value="'+(state.geometryMode==='alphabeta'?'alphabeta':'riemannian')+'"]');if(gm){gm.checked=true;fire(gm,'change');}
          if(el('lagrangian'))el('lagrangian').value=String(state.lagrangian||'');
          if(Array.isArray(state.metric))state.metric.forEach(function(row,i){if(!Array.isArray(row))return;row.forEach(function(v,j){var n=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');if(n)n.value=String(v);});});
          if(Array.isArray(state.oneForm))state.oneForm.forEach(function(v,i){var n=document.querySelector('.oneform-entry[data-i="'+i+'"]');if(n)n.value=String(v);});
          if(el('alphaBetaType')){el('alphaBetaType').value=String(state.alphaBetaType||'randers');fire(el('alphaBetaType'),'change');}
          if(el('mParameter'))el('mParameter').value=String(state.m==null?'1':state.m);
          if(el('constantsInput'))el('constantsInput').value=String(state.constants||'');
          if(el('functionsInput'))el('functionsInput').value=String(state.functions||'');
          if(state.outputs)qa('[data-output]').forEach(function(n){if(Object.prototype.hasOwnProperty.call(state.outputs,n.dataset.output)){n.checked=!!state.outputs[n.dataset.output];fire(n,'change');}});
          var note=el('exampleNote');if(note)note.textContent='Shared calculator setup restored from URL.';
          var results=el('results');if(results)results.innerHTML='';
          setStatus('Shared calculator setup restored.','success');
          window.FINSLER_SHARED_STATE_RESTORED=true;
        }finally{restoring=false;}
      },30);
      return true;
    }catch(err){restoring=false;setStatus('Could not restore shared setup: '+(err.message||err),'error');return false;}
  }
  function copy(text,button){
    function flash(ok){var old=button.textContent;button.textContent=ok?'Link copied':'Copy failed';setTimeout(function(){button.textContent=old;},1000);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){flash(true);},function(){fallback();});}else fallback();
    function fallback(){var t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}t.remove();flash(ok);}
  }
  function copyLink(button){
    var encoded=encodeState(snapshot()),base=location.origin+location.pathname+location.search,url=base+'#'+HASH_KEY+'='+encoded;copy(url,button);setStatus('Shareable setup link copied'+(url.length>8000?' (large setup).':'.'),'success');
  }
  function installButton(){
    var toolbar=document.querySelector('.calculator-toolbar');if(!toolbar||el('copyFinslerSetupLink'))return;
    var b=document.createElement('button');b.type='button';b.id='copyFinslerSetupLink';b.className='utility-button finsler-share-button';b.textContent='Copy setup link';b.title='Copy a link containing the current inputs and selected outputs';b.addEventListener('click',function(){copyLink(b);});toolbar.appendChild(b);
    var style=document.createElement('style');style.id='finsler-share-styles';style.textContent='.finsler-share-button{margin-left:auto;align-self:center;white-space:nowrap}@media(max-width:700px){.finsler-share-button{width:100%;margin:.6rem 0 0}}';document.head.appendChild(style);
  }
  var encoded=currentHashState();
  if(encoded){document.addEventListener('click',function(e){var load=e.target&&e.target.closest&&e.target.closest('.catalogue-load');if(load&&!e.isTrusted&&!restoring&&performance.now()<2800){e.preventDefault();e.stopImmediatePropagation();}},true);}
  function init(){installButton();if(encoded){try{restore(decodeState(encoded));}catch(err){setStatus('Invalid shared calculator link.','error');}}window.FINSLER_SHARE_API={snapshot:snapshot,encodeState:encodeState,decodeState:decodeState,restore:restore,copyLink:copyLink};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();