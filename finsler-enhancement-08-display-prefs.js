(function(){
  "use strict";
  var KEY='finslerDisplayPrefsV1',defaults={compactTrig:true,subscriptUnderscore:true,coordinateStyle:'names',density:'comfortable',autoExpand:false},prefs=load();
  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function load(){try{return Object.assign({},defaults,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){return Object.assign({},defaults);}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}applyCss();}
  function regexEscape(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function coordTex(name){var greek={theta:'\\theta',phi:'\\phi',psi:'\\psi',eta:'\\eta',rho:'\\rho',tau:'\\tau',sigma:'\\sigma',lambda:'\\lambda',mu:'\\mu',nu:'\\nu'};if(greek[name])return greek[name];if(/^[A-Za-z]$/.test(name))return name;return '\\mathrm{'+String(name).replace(/[^A-Za-z0-9_]/g,'')+'}';}
  function coords(){return qa('.coordinate-input').map(function(n){return n.value.trim();});}
  function underscoredSymbols(){var seen={},out=[];qa('.metric-entry,.oneform-entry,.coordinate-input,#lagrangian,#constantsInput,#functionsInput,#mParameter').forEach(function(n){String(n.value||'').replace(/\b([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]+)\b/g,function(_,name){if(!seen[name]){seen[name]=1;out.push(name);}return _;});});return out;}
  function literalUnderscores(s){
    underscoredSymbols().forEach(function(name){var p=name.indexOf('_'),base=name.slice(0,p),sub=name.slice(p+1),forms=[base+'_{'+sub+'}','\\mathrm{'+base+'_{'+sub+'}}'];forms.forEach(function(form){s=s.replace(new RegExp(regexEscape(form),'g'),base+'\\_'+sub);});});return s;
  }
  function parenthesizeTrig(s){
    var arg='(?:\\\\[A-Za-z]+|[A-Za-z](?:_\\{[^{}]+\\})?|\\\\mathrm\\{[^{}]+\\})';
    return s.replace(new RegExp('(\\\\(?:sin|cos|tan|sinh|cosh|tanh)(?:\\^\\{[^{}]+\\})?)\\s+('+arg+')','g'),'$1\\left($2\\right)');
  }
  function numberedLhs(lhs,names){
    var single={};names.forEach(function(n,i){if(/^[A-Za-z]$/.test(n))single[n]=String(i+1);});
    lhs=lhs.replace(/([_^])\{([A-Za-z]+)\}/g,function(all,prefix,content){var chars=content.split('');if(chars.length&&chars.every(function(ch){return single[ch];}))return prefix+'{'+chars.map(function(ch){return single[ch];}).join('')+'}';return all;});
    names.forEach(function(name,i){var t=coordTex(name),num=String(i+1);if(t.charAt(0)==='\\')lhs=lhs.replace(new RegExp(regexEscape(t),'g'),num);else lhs=lhs.replace(new RegExp('(^|[^A-Za-z])'+regexEscape(t)+'(?=[^A-Za-z]|$)','g'),'$1'+num);});
    return lhs;
  }
  function numberedRhs(rhs,names){
    names.forEach(function(name,i){var t=coordTex(name),num=String(i+1);rhs=rhs.replace(new RegExp('y_\\{'+regexEscape(t)+'\\}','g'),'y^{'+num+'}');});
    names.forEach(function(name,i){var t=coordTex(name),rep='x^{'+(i+1)+'}';if(t.charAt(0)==='\\')rhs=rhs.replace(new RegExp(regexEscape(t),'g'),rep);else rhs=rhs.replace(new RegExp('(^|[^A-Za-z\\\\])'+regexEscape(t)+'(?!_\\{|\\\\_)(?=[^A-Za-z]|$)','g'),'$1'+rep);});
    return rhs;
  }
  function numberedCoordinates(s){var p=s.indexOf('='),names=coords();if(p<0)return numberedRhs(s,names);return numberedLhs(s.slice(0,p),names)+'='+numberedRhs(s.slice(p+1),names);}
  function transformSource(source){var s=String(source);if(!prefs.subscriptUnderscore)s=literalUnderscores(s);if(!prefs.compactTrig)s=parenthesizeTrig(s);if(prefs.coordinateStyle==='numbered')s=numberedCoordinates(s);return s;}
  function applyRaw(root){
    if(!root||!document.createTreeWalker)return;var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),node;
    while((node=walker.nextNode())){if(node.parentElement&&node.parentElement.closest('mjx-container'))continue;var text=node.nodeValue;if(text.indexOf('\\[')===-1&&text.indexOf('\\(')===-1)continue;var changed=transformSource(text);if(changed!==text)node.nodeValue=changed;}
    qa('.component-main[data-finsler-copy-source]',root).forEach(function(n){if(!n.dataset.finslerDisplayBase)n.dataset.finslerDisplayBase=n.dataset.finslerCopySource;n.dataset.finslerCopySource=transformSource(n.dataset.finslerDisplayBase);});
  }
  function applyCss(){document.body.classList.toggle('finsler-results-compact',prefs.density==='compact');}
  function maybeExpand(root){if(!prefs.autoExpand)return;setTimeout(function(){qa('.expression-toggle[aria-expanded="false"]',root||document).forEach(function(b){b.click();});},30);}
  function notifyRecalculate(){var results=el('results'),status=el('status');if(results&&results.children.length&&status){status.textContent='Display preference saved. Recalculate to apply notation changes to existing formulas.';status.className='calc-status';}}
  function control(label,input,help){var row=document.createElement('label');row.className='finsler-display-option';var span=document.createElement('span');span.innerHTML='<strong>'+label+'</strong>'+(help?'<small>'+help+'</small>':'');row.appendChild(span);row.appendChild(input);return row;}
  function installMenu(){
    var toolbar=document.querySelector('.calculator-toolbar');if(!toolbar||el('finslerDisplayMenu'))return;
    var details=document.createElement('details');details.id='finslerDisplayMenu';details.className='finsler-display-menu';var summary=document.createElement('summary');summary.textContent='Display';details.appendChild(summary);var panel=document.createElement('div');panel.className='finsler-display-panel';
    var trig=document.createElement('input');trig.type='checkbox';trig.checked=!!prefs.compactTrig;trig.addEventListener('change',function(){prefs.compactTrig=trig.checked;save();notifyRecalculate();});panel.appendChild(control('Compact trigonometry',trig,'Use sin θ and sin² θ when the argument is one symbol.'));
    var sub=document.createElement('input');sub.type='checkbox';sub.checked=!!prefs.subscriptUnderscore;sub.addEventListener('change',function(){prefs.subscriptUnderscore=sub.checked;save();notifyRecalculate();});panel.appendChild(control('Underscores as subscripts',sub,'Render an entered r_s as rₛ; plain rs remains rs.'));
    var select=document.createElement('select');select.innerHTML='<option value="names">Coordinate names</option><option value="numbered">Numbered xᶦ / yᶦ</option>';select.value=prefs.coordinateStyle;select.addEventListener('change',function(){prefs.coordinateStyle=select.value;save();notifyRecalculate();});panel.appendChild(control('Coordinate display',select,'Choose named coordinates or numbered coordinate/fiber notation.'));
    var density=document.createElement('select');density.innerHTML='<option value="comfortable">Comfortable</option><option value="compact">Compact</option>';density.value=prefs.density;density.addEventListener('change',function(){prefs.density=density.value;save();});panel.appendChild(control('Result spacing',density,''));
    var expand=document.createElement('input');expand.type='checkbox';expand.checked=!!prefs.autoExpand;expand.addEventListener('change',function(){prefs.autoExpand=expand.checked;save();if(expand.checked)maybeExpand(el('results'));});panel.appendChild(control('Auto-expand long results',expand,'Otherwise long symbolic expressions stay collapsed.'));
    var algebra=document.createElement('p');algebra.className='finsler-display-algebra';algebra.innerHTML='<strong>Algebraic form</strong><span>Canonical factored output</span>';panel.appendChild(algebra);
    details.appendChild(panel);var share=el('copyFinslerSetupLink');if(share)toolbar.insertBefore(details,share);else toolbar.appendChild(details);
  }
  function styles(){var s=document.createElement('style');s.id='finsler-display-styles';s.textContent='.finsler-display-menu{position:relative;margin-left:auto;align-self:center}.finsler-display-menu summary{list-style:none;cursor:pointer;border:1px solid rgba(67,76,94,.22);background:#fff;border-radius:.55rem;padding:.45rem .65rem;font-size:.8rem;font-weight:650;color:#434c5e}.finsler-display-menu summary::-webkit-details-marker{display:none}.finsler-display-panel{position:absolute;right:0;top:calc(100% + .45rem);z-index:80;width:min(88vw,330px);padding:.65rem;background:#fff;border:1px solid rgba(67,76,94,.18);border-radius:.8rem;box-shadow:0 14px 35px rgba(20,30,45,.15)}.finsler-display-option{display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.55rem .35rem}.finsler-display-option+ .finsler-display-option{border-top:1px solid rgba(67,76,94,.08)}.finsler-display-option span{display:grid;gap:.12rem}.finsler-display-option strong{font-size:.8rem;color:#252b35}.finsler-display-option small{font-size:.69rem;line-height:1.35;color:#6b7280}.finsler-display-option select{max-width:8.5rem}.finsler-display-algebra{display:flex;justify-content:space-between;gap:1rem;margin:.45rem .35rem .15rem;padding-top:.55rem;border-top:1px solid rgba(67,76,94,.08);font-size:.72rem;color:#6b7280}.finsler-results-compact .component-row{padding-top:.35rem!important;padding-bottom:.35rem!important}.finsler-results-compact .result-card{padding-top:.85rem!important;padding-bottom:.85rem!important}.finsler-results-compact .component-list{gap:.15rem!important}@media(max-width:700px){.finsler-display-menu{margin-left:0}.finsler-display-panel{position:fixed;left:4vw;right:4vw;top:auto;bottom:5.4rem;width:auto}}';document.head.appendChild(s);}
  function init(){styles();installMenu();applyCss();var results=el('results');if(results)new MutationObserver(function(records){records.forEach(function(r){Array.prototype.forEach.call(r.addedNodes,function(n){if(n.nodeType===1){applyRaw(n);maybeExpand(n);}});});}).observe(results,{childList:true,subtree:true});window.FINSLER_DISPLAY_PREFS={get:function(){return Object.assign({},prefs);},transformSource:transformSource};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();