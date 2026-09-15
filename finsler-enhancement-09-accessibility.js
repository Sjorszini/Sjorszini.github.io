(function(){
  "use strict";
  var idCounter=0,auditTimer=null;
  function el(id){return document.getElementById(id);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function ensureId(node,prefix){if(!node)return'';if(!node.id)node.id=(prefix||'finsler-a11y')+'-'+(++idCounter);return node.id;}
  function appendRef(node,attr,id){if(!node||!id)return;var parts=String(node.getAttribute(attr)||'').split(/\s+/).filter(Boolean);if(parts.indexOf(id)===-1)parts.push(id);node.setAttribute(attr,parts.join(' '));}
  function srLabel(control,text){
    if(!control)return null;var id=ensureId(control,'finsler-control'),existing=document.querySelector('label[for="'+id.replace(/"/g,'\\"')+'"]');if(existing)return existing;
    var label=document.createElement('label');label.className='finsler-sr-only';label.htmlFor=id;label.textContent=text;control.parentNode.insertBefore(label,control);return label;
  }
  function customLandmarks(){
    var quote=document.querySelector('EinsteinQuote');if(quote){quote.setAttribute('role','note');quote.setAttribute('aria-label','Einstein quotation');}
    var nav=document.querySelector('menubar');if(nav){nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Site navigation');}
    var menu=el('site-menu');if(menu){menu.setAttribute('role','list');menu.setAttribute('aria-label','Site pages');}
    qa('menu-item',menu).forEach(function(item){item.setAttribute('role','listitem');});
  }
  function labelCatalogue(){
    srLabel(el('catalogueSearch'),'Search metric catalogue');
    srLabel(el('catalogueGroup'),'Filter metric catalogue by group');
    srLabel(el('catalogueTagFilter'),'Filter metric catalogue by mathematical tag');
  }
  function labelControls(){
    var plain=el('plainMetricHint'),plainId=ensureId(plain,'metric-mode-help');var gm=document.querySelector('.segmented-control[aria-label="Metric use"]');if(gm&&plainId)gm.setAttribute('aria-describedby',plainId);
    var fiber=el('fiberHint'),fiberId=ensureId(fiber,'fiber-help'),coordsHost=el('coordinateFields');if(coordsHost&&fiberId){coordsHost.setAttribute('role','group');coordsHost.setAttribute('aria-label','Coordinate names');coordsHost.setAttribute('aria-describedby',fiberId);}
    qa('.output-group').forEach(function(group){var title=group.querySelector('.output-group-title');if(title){group.setAttribute('role','group');group.setAttribute('aria-labelledby',ensureId(title,'output-group-title'));}});
    var outputs=document.querySelector('.output-card');if(outputs)outputs.setAttribute('aria-label','Output selection');
    var input=document.querySelector('.input-card');if(input)input.setAttribute('aria-label','Geometry input');
    var notation=document.querySelector('.notation-card');if(notation)notation.setAttribute('aria-label','Notation');
    var status=el('status');if(status){status.setAttribute('aria-atomic','true');status.setAttribute('aria-live','polite');}
  }
  function validationAccessibility(){
    var live=el('finslerValidationLive');if(!live){live=document.createElement('div');live.id='finslerValidationLive';live.className='finsler-sr-only';live.setAttribute('role','alert');live.setAttribute('aria-live','assertive');live.setAttribute('aria-atomic','true');var shell=el('calculator-shell');(shell||document.body).appendChild(live);}
    qa('.finsler-validation-message').forEach(function(msg){var id=ensureId(msg,'validation-message'),parent=msg.parentElement,input=parent&&parent.querySelector('input,textarea,select');if(input)appendRef(input,'aria-describedby',id);});
    qa('[aria-invalid="true"]').forEach(function(input){var own=input.parentElement&&input.parentElement.querySelector('.finsler-validation-message');if(own){appendRef(input,'aria-errormessage',ensureId(own,'validation-message'));}else input.setAttribute('aria-errormessage',live.id);if(input.dataset.validationError)live.textContent=(input.getAttribute('aria-label')||input.name||input.id||'Input')+': '+input.dataset.validationError;});
  }
  function resultAccessibility(root){
    var host=root||document;
    qa('.progress-card',host).forEach(function(card){var h=card.querySelector('h2');if(h)card.setAttribute('aria-labelledby',ensureId(h,'progress-heading'));});
    var live=el('live-step');if(live){live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');}
    qa('.result-card',host).forEach(function(card){var h=card.querySelector('.result-heading h2');if(h){card.setAttribute('aria-labelledby',ensureId(h,'result-heading'));card.setAttribute('role','region');}});
    qa('.finsler-component-tools,.finsler-section-tools',host).forEach(function(t){if(!t.getAttribute('role'))t.setAttribute('role','toolbar');});
    qa('.expression-toggle',host).forEach(function(b){var expanded=b.closest('.result-card')&&b.closest('.result-card').querySelector('.expanded-expression');if(expanded){var id=ensureId(expanded,'expanded-expression');b.setAttribute('aria-controls',id);}});
    var results=el('results');if(results){results.setAttribute('role','region');results.setAttribute('aria-label','Calculation results');}
  }
  function catalogueCards(root){qa('.catalogue-card',root||document).forEach(function(card){var h=card.querySelector('h4'),button=card.querySelector('.catalogue-load');if(h){var id=ensureId(h,'catalogue-title');card.setAttribute('aria-labelledby',id);if(button)button.setAttribute('aria-label','Load '+h.textContent.trim());}});}
  function audit(){
    var issues=[];
    var nav=document.querySelector('menubar');if(nav&&nav.getAttribute('role')!=='navigation')issues.push('Site navigation is not exposed as navigation.');
    ['catalogueSearch','catalogueGroup','catalogueTagFilter'].forEach(function(id){var n=el(id);if(n&&!document.querySelector('label[for="'+n.id+'"]')&&!n.getAttribute('aria-label'))issues.push(id+' has no accessible label.');});
    qa('.output-group').forEach(function(g){if(!g.getAttribute('aria-labelledby'))issues.push('Output group lacks an accessible heading.');});
    qa('.result-card').forEach(function(card){if(!card.getAttribute('aria-labelledby'))issues.push('Result region lacks an accessible heading.');});
    qa('[aria-invalid="true"]').forEach(function(n){if(!n.getAttribute('aria-errormessage')&&!n.getAttribute('aria-describedby'))issues.push('Invalid input lacks an accessible error reference.');});
    window.FINSLER_ACCESSIBILITY_AUDIT={ok:issues.length===0,issues:issues,checkedAt:Date.now()};if(issues.length&&window.console&&console.warn)console.warn('Finsler accessibility audit:',issues);return window.FINSLER_ACCESSIBILITY_AUDIT;
  }
  function scheduleAudit(){clearTimeout(auditTimer);auditTimer=setTimeout(audit,100);}
  function apply(root){customLandmarks();labelCatalogue();labelControls();validationAccessibility();resultAccessibility(root);catalogueCards(root);scheduleAudit();}
  function styles(){if(el('finsler-a11y-styles'))return;var s=document.createElement('style');s.id='finsler-a11y-styles';s.textContent='.finsler-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.finsler-page :focus-visible{outline:2px solid currentColor;outline-offset:3px}.catalogue-card:focus-within{box-shadow:0 0 0 2px rgba(30,77,121,.18)}';document.head.appendChild(s);}
  function init(){styles();apply(document);var shell=el('calculator-shell');if(shell)new MutationObserver(function(records){records.forEach(function(r){Array.prototype.forEach.call(r.addedNodes,function(n){if(n.nodeType===1)apply(n);});});validationAccessibility();scheduleAudit();}).observe(shell,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-invalid']});document.addEventListener('input',function(){setTimeout(function(){validationAccessibility();scheduleAudit();},0);},true);window.FINSLER_ACCESSIBILITY_API={apply:apply,audit:audit};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();