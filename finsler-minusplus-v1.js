(function(){
  "use strict";

  var SIGNATURE="-+++";
  var PP_H="x^2-y^2";
  var FINSLER_GROUP="Finsler examples";

  function isLorentzGroup(group){
    return group==="Ansätze / pre-solutions" || String(group||"").indexOf("Catalogue ·")===0;
  }
  function sultanaMinusPlusMatrix(){
    return [
      ["-t^4*(1-2*M/r)","2*M*t^4/r","0","0"],
      ["2*M*t^4/r","t^4*(1+2*M/r)","0","0"],
      ["0","0","t^4*r^2","0"],
      ["0","0","0","t^4*r^2*sin(theta)^2"]
    ];
  }
  function normalizeCatalogueSource(){
    if(window.__FINSLER_MINUSPLUS_NORMALIZED) return;
    var items=window.FINSLER_METRIC_CATALOGUE||[];
    items.forEach(function(item){
      var originalId=item.id;
      var originalGroup=item.group;
      if(!isLorentzGroup(originalGroup)) return;

      /*
       * finsler-ui-v6 predates the page-wide (-+++) convention and otherwise
       * converts Catalogue/Ansatz entries to (+---). Move those entries into
       * neutral internal group/id names before v6 initializes so the matrices
       * in the catalogue remain the single source of truth. Keep the original
       * identity for diagnostics and future cleanup of the legacy v6 path.
       */
      item._minusPlusLorentz=true;
      item._sourceId=originalId;
      item._sourceGroup=originalGroup;
      item.signature=SIGNATURE;
      item.id="minusplus-"+originalId;
      if(originalGroup==="Ansätze / pre-solutions") item.group="Ansätze & pre-solutions";
      else item.group=String(originalGroup).replace(/^Catalogue ·/,"Spacetime catalogue ·");

      /* Müller & Grave print Sultana–Dyer with the opposite global sign. */
      if(originalId==="sultana-dyer"){
        item.matrix=sultanaMinusPlusMatrix();
        item.description="Black hole in an Einstein–de Sitter universe, converted from the catalogue's (+---) form to the page-wide (-+++) convention.";
        item.validation="Catalogue curvature check with the global metric sign converted to (-+++)";
      }
    });
    window.__FINSLER_MINUSPLUS_NORMALIZED=true;
    window.FINSLER_SIGNATURE_CONVENTION=SIGNATURE;
  }

  function auditCatalogueNormalization(){
    var items=window.FINSLER_METRIC_CATALOGUE||[],lorentz=items.filter(function(item){return item._minusPlusLorentz===true;}),problems=[];
    lorentz.forEach(function(item){
      if(item.signature!==SIGNATURE) problems.push((item._sourceId||item.id)+": signature metadata is "+String(item.signature));
      if(!item._sourceId||!item._sourceGroup) problems.push((item.id||"unknown")+": missing source identity");
      if(String(item.id).indexOf("minusplus-")!==0) problems.push((item._sourceId||item.id)+": legacy v6 guard not applied");
    });
    var sultana=lorentz.find(function(item){return item._sourceId==="sultana-dyer";});
    if(!sultana) problems.push("sultana-dyer: entry missing");
    else if(String(sultana.matrix[0][0]).charAt(0)!=="-") problems.push("sultana-dyer: global sign conversion missing");
    window.FINSLER_SIGNATURE_AUDIT={convention:SIGNATURE,lorentzianEntries:lorentz.length,problems:problems.slice(),ok:problems.length===0};
    if(problems.length&&window.console&&console.error) console.error("Finsler (-+++) normalization audit failed:",problems);
  }

  function ppWaveMatrix(){
    return [[PP_H,"-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]];
  }
  function installFinslerCatalogueExamples(){
    var items=window.FINSLER_METRIC_CATALOGUE||(window.FINSLER_METRIC_CATALOGUE=[]);
    var existing={};
    items.forEach(function(item){existing[item.id]=true;existing[item._sourceId||""]=true;});
    var examples=[
      {
        id:"finsler-randers-pp", group:FINSLER_GROUP, title:"Randers pp-wave", dim:4,
        coords:["u","v","x","y"], matrix:ppWaveMatrix(),
        inputMode:"metric", geometryMode:"alphabeta", alphaBetaType:"randers", oneForm:["1","0","0","0"],
        signature:SIGNATURE,
        description:"Randers Finsler spacetime F = α + β on a vacuum Brinkmann pp-wave background, with β = du.",
        source:"Finsler example", validation:"Vacuum pp-wave background; β = du", status:"example"
      },
      {
        id:"finsler-mkropina-pp", group:FINSLER_GROUP, title:"m-Kropina pp-wave", dim:4,
        coords:["u","v","x","y"], matrix:ppWaveMatrix(),
        inputMode:"metric", geometryMode:"alphabeta", alphaBetaType:"mkropina", mParameter:"1", oneForm:["1","0","0","0"],
        signature:SIGNATURE,
        description:"m-Kropina Finsler spacetime on the same (-+++) Brinkmann pp-wave background, with β = du and default m = 1.",
        source:"Finsler example", validation:"Known pp-wave α–β test case", status:"example"
      },
      {
        id:"finsler-brinkmann-pp", group:FINSLER_GROUP, title:"Brinkmann pp-wave background", dim:4,
        coords:["u","v","x","y"], matrix:ppWaveMatrix(),
        inputMode:"metric", geometryMode:"riemannian", signature:SIGNATURE,
        description:"Pseudo-Riemannian Brinkmann pp-wave used as the background metric for the Finsler pp-wave examples.",
        source:"Finsler example", validation:"Ricci-flat for H = x²-y²", status:"verified"
      },
      {
        id:"finsler-direct-2d", group:FINSLER_GROUP, title:"Direct 2D Randers-type Lagrangian", dim:2,
        coords:["x","y"], matrix:[["1+x^2","0"],["0","1"]],
        inputMode:"lagrangian",
        lagrangian:"(sqrt((1+x^2)*y_x^2 + y_y^2) + 0.15*y_y)^2",
        description:"A direct 2-homogeneous Finsler Lagrangian, entered without using the α–β builder.",
        source:"Finsler example", validation:"Direct Lagrangian / fundamental-tensor smoke test", status:"example"
      }
    ];
    examples.slice().reverse().forEach(function(item){if(!existing[item.id])items.unshift(item);});
  }

  function metricInputs(){return Array.prototype.slice.call(document.querySelectorAll(".metric-entry"));}
  function setMatrix(matrix){
    metricInputs().forEach(function(input){
      var i=Number(input.dataset.i),j=Number(input.dataset.j);
      if(matrix[i]&&matrix[i][j]!==undefined) input.value=matrix[i][j];
    });
  }
  function normalizeQuickExample(){
    var select=document.getElementById("exampleSelect"),note=document.getElementById("exampleNote");
    if(!select||!metricInputs().length) return;
    if(select.value==="randerspp"){
      setMatrix(ppWaveMatrix());
      if(note) note.textContent="Randers pp-wave in (-+++): ds² = -2 du dv + H du² + dx² + dy², H=x²-y², β=du.";
    }else if(select.value==="ppwaveMetric4"){
      setMatrix(ppWaveMatrix());
      if(note) note.textContent="Brinkmann pp-wave in (-+++): ds² = -2 du dv + H du² + dx² + dy².";
    }else if(select.value==="mkropinaPP"){
      setMatrix(ppWaveMatrix());
      if(note) note.textContent="m-Kropina pp-wave in (-+++), β=du, default m=1.";
    }else if(select.value==="minkowski4"){
      setMatrix([["-1","0","0","0"],["0","1","0","0"],["0","0","1","0"],["0","0","0","1"]]);
      if(note) note.textContent="Minkowski metric with (-+++) signature.";
    }
  }

  function itemForCard(card){
    var titleNode=card&&card.querySelector("h4"),title=titleNode?titleNode.textContent:"";
    return (window.FINSLER_METRIC_CATALOGUE||[]).find(function(item){return item.title===title;})||null;
  }
  function isLorentzCard(card){
    var group=card&&card.querySelector(".catalogue-group");
    var text=group?group.textContent:"";
    return text.indexOf("Spacetime catalogue ·")===0 || text==="Ansätze & pre-solutions";
  }
  function isFinslerCard(card){
    var group=card&&card.querySelector(".catalogue-group");
    return !!(group&&group.textContent===FINSLER_GROUP);
  }
  function decorateCatalogue(){
    document.querySelectorAll(".catalogue-card").forEach(function(card){
      var item=itemForCard(card),needsSignature=isLorentzCard(card)||(isFinslerCard(card)&&item&&item.signature);
      if(!needsSignature) return;
      var meta=card.querySelector(".catalogue-meta");
      if(!meta) return;
      var chip=card.querySelector(".catalogue-chip.is-signature");
      if(!chip){
        chip=document.createElement("span");
        chip.className="catalogue-chip is-signature";
        meta.appendChild(chip);
      }
      chip.textContent=SIGNATURE;
    });
  }
  function patchCatalogueLoadedNote(card){
    if(!isLorentzCard(card)) return;
    var item=itemForCard(card),note=document.getElementById("exampleNote");
    if(!item||!note) return;
    note.textContent=item.title+" · "+item.source+" · signature (-+++) · reference check: "+item.validation+".";
  }

  function setRadio(name,value){
    var node=document.querySelector('input[name="'+name+'"][value="'+value+'"]');
    if(!node) return;
    node.checked=true;
    node.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function setOneForm(values){
    Array.prototype.forEach.call(document.querySelectorAll(".oneform-entry"),function(input){
      var i=Number(input.dataset.i);
      if(values&&values[i]!==undefined) input.value=values[i];
    });
  }
  function applyFinslerCatalogueEntry(card){
    var item=itemForCard(card);
    if(!item||item.group!==FINSLER_GROUP) return;
    if(item.inputMode==="lagrangian"){
      setRadio("inputMode","lagrangian");
      var lag=document.getElementById("lagrangian");
      if(lag) lag.value=item.lagrangian||"";
    }else{
      setRadio("inputMode","metric");
      setRadio("geometryMode",item.geometryMode==="alphabeta"?"alphabeta":"riemannian");
      if(item.geometryMode==="alphabeta"){
        var type=document.getElementById("alphaBetaType");
        if(type){type.value=item.alphaBetaType||"randers";type.dispatchEvent(new Event("change",{bubbles:true}));}
        var m=document.getElementById("mParameter");
        if(m&&item.mParameter!==undefined)m.value=String(item.mParameter);
        setOneForm(item.oneForm||[]);
      }
    }
    var note=document.getElementById("exampleNote");
    if(note)note.textContent=item.title+" · "+item.description+(item.signature?" · signature "+item.signature:"")+".";
    var status=document.getElementById("status");
    if(status){status.textContent="Catalogue example loaded.";status.className="calc-status";}
    syncMetricOutputOption();
  }

  function currentMode(name,fallback){
    var node=document.querySelector('input[name="'+name+'"]:checked');
    return node?node.value:fallback;
  }
  function syncMetricOutputOption(){
    var checkbox=document.querySelector('[data-output="metric"]');
    if(!checkbox)return;
    var row=checkbox.closest(".output-check");
    var hide=currentMode("inputMode","metric")==="metric"&&currentMode("geometryMode","riemannian")==="riemannian";
    if(hide){
      if(!checkbox.disabled)checkbox.dataset.savedChecked=checkbox.checked?"1":"0";
      checkbox.checked=false;
      checkbox.disabled=true;
      if(row)row.hidden=true;
    }else{
      var wasDisabled=checkbox.disabled;
      checkbox.disabled=false;
      if(row)row.hidden=false;
      if(wasDisabled)checkbox.checked=checkbox.dataset.savedChecked!=="0";
    }
    checkbox.dispatchEvent(new Event("change"));
  }

  function regexEscape(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function texCommandForCoordinate(name){
    var map={theta:"theta",phi:"phi",psi:"psi",eta:"eta",rho:"rho",tau:"tau",sigma:"sigma",lambda:"lambda",mu:"mu",nu:"nu"};
    return map[name]||null;
  }
  function repairCoordinateLabels(text){
    var names=Array.prototype.map.call(document.querySelectorAll(".coordinate-input"),function(n){return n.value.trim();});
    var changed=String(text);
    names.forEach(function(left){
      var leftCommand=texCommandForCoordinate(left);
      if(!leftCommand)return;
      names.forEach(function(right){
        var rightCommand=texCommandForCoordinate(right),pattern,replacement;
        if(rightCommand){
          pattern=new RegExp("\\\\"+leftCommand+"(?:\\\\)?"+rightCommand,"g");
          replacement="{\\"+leftCommand+"}{\\"+rightCommand+"}";
        }else if(/^[A-Za-z]$/.test(right)){
          pattern=new RegExp("\\\\"+leftCommand+regexEscape(right),"g");
          replacement="{\\"+leftCommand+"}"+right;
        }else return;
        changed=changed.replace(pattern,replacement);
      });
    });
    return changed;
  }
  function normalizeCoordinateLabels(root){
    if(!root||!document.createTreeWalker)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),node;
    while((node=walker.nextNode())){
      var text=node.nodeValue;
      if(text.indexOf("\\[")===-1&&text.indexOf("\\(")===-1)continue;
      var changed=repairCoordinateLabels(text);
      if(changed!==text)node.nodeValue=changed;
    }
  }
  function installCoordinateLabelGuard(){
    if(!window.MathJax||!MathJax.typesetPromise||MathJax.__finslerCoordinateLabelGuard)return;
    var original=MathJax.typesetPromise.bind(MathJax);
    MathJax.typesetPromise=function(nodes){
      (nodes||[]).forEach(normalizeCoordinateLabels);
      return original(nodes);
    };
    MathJax.__finslerCoordinateLabelGuard=true;
  }

  function scheduleQuickNormalization(){
    /* Run after the legacy v6 click/DOMContentLoaded handler has populated the grid. */
    setTimeout(normalizeQuickExample,0);
  }

  normalizeCatalogueSource();
  auditCatalogueNormalization();
  installFinslerCatalogueExamples();
  installCoordinateLabelGuard();

  document.addEventListener("click",function(event){
    var loadExample=event.target.closest&&event.target.closest("#loadExample");
    if(loadExample) scheduleQuickNormalization();
    var loadMetric=event.target.closest&&event.target.closest(".catalogue-load");
    if(loadMetric){
      var card=loadMetric.closest(".catalogue-card");
      setTimeout(function(){patchCatalogueLoadedNote(card);applyFinslerCatalogueEntry(card);decorateCatalogue();},0);
    }
    if(event.target&&(event.target.id==="selectAllOutputs"||event.target.id==="selectEssentials"||event.target.id==="clearAllOutputs")){
      setTimeout(syncMetricOutputOption,0);
    }
  });
  document.addEventListener("input",function(event){
    if(event.target&&event.target.id==="catalogueSearch") setTimeout(decorateCatalogue,0);
  });
  document.addEventListener("change",function(event){
    if(event.target&&event.target.id==="catalogueGroup") setTimeout(decorateCatalogue,0);
    if(event.target&&event.target.name&&(event.target.name==="inputMode"||event.target.name==="geometryMode")) setTimeout(syncMetricOutputOption,0);
  });

  document.addEventListener("DOMContentLoaded",function(){
    installCoordinateLabelGuard();
    var legacyPicker=document.querySelector(".quick-example-row");
    if(legacyPicker){legacyPicker.hidden=true;legacyPicker.setAttribute("aria-hidden","true");}
    syncMetricOutputOption();
    scheduleQuickNormalization();
    setTimeout(function(){
      decorateCatalogue();
      var grid=document.getElementById("catalogueGrid");
      if(grid)new MutationObserver(decorateCatalogue).observe(grid,{childList:true});
    },0);
  });
})();