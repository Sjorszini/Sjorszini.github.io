(function(){
  "use strict";

  var SIGNATURE="-+++";
  var PP_H="x^2-y^2";

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
       * converts Catalogue/Ansatz entries to (+---).  Move those entries into
       * neutral internal group/id names before v6 initializes so the matrices
       * in the catalogue remain the single source of truth.  Keep the original
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

  function metricInputs(){return Array.prototype.slice.call(document.querySelectorAll(".metric-entry"));}
  function setMatrix(matrix){
    metricInputs().forEach(function(input){
      var i=Number(input.dataset.i),j=Number(input.dataset.j);
      if(matrix[i]&&matrix[i][j]!==undefined) input.value=matrix[i][j];
    });
  }
  function ppWaveMatrix(){
    return [[PP_H,"-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]];
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

  function isLorentzCard(card){
    var group=card&&card.querySelector(".catalogue-group");
    var text=group?group.textContent:"";
    return text.indexOf("Spacetime catalogue ·")===0 || text==="Ansätze & pre-solutions";
  }
  function decorateCatalogue(){
    document.querySelectorAll(".catalogue-card").forEach(function(card){
      if(!isLorentzCard(card)) return;
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
    var titleNode=card.querySelector("h4"),note=document.getElementById("exampleNote");
    if(!titleNode||!note) return;
    var title=titleNode.textContent;
    var item=(window.FINSLER_METRIC_CATALOGUE||[]).find(function(x){return x.title===title;});
    if(!item) return;
    note.textContent=item.title+" · "+item.source+" · signature (-+++) · reference check: "+item.validation+".";
  }

  function scheduleQuickNormalization(){
    /* Run after the legacy v6 click/DOMContentLoaded handler has populated the grid. */
    setTimeout(normalizeQuickExample,0);
  }

  normalizeCatalogueSource();

  document.addEventListener("click",function(event){
    var loadExample=event.target.closest&&event.target.closest("#loadExample");
    if(loadExample) scheduleQuickNormalization();
    var loadMetric=event.target.closest&&event.target.closest(".catalogue-load");
    if(loadMetric){
      var card=loadMetric.closest(".catalogue-card");
      setTimeout(function(){patchCatalogueLoadedNote(card);decorateCatalogue();},0);
    }
  });
  document.addEventListener("input",function(event){
    if(event.target&&event.target.id==="catalogueSearch") setTimeout(decorateCatalogue,0);
  });
  document.addEventListener("change",function(event){
    if(event.target&&event.target.id==="catalogueGroup") setTimeout(decorateCatalogue,0);
  });

  document.addEventListener("DOMContentLoaded",function(){
    scheduleQuickNormalization();
    setTimeout(function(){
      decorateCatalogue();
      var grid=document.getElementById("catalogueGrid");
      if(grid) new MutationObserver(decorateCatalogue).observe(grid,{childList:true});
    },0);
  });
})();
