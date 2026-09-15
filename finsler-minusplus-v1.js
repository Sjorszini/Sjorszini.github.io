(function(){
  "use strict";

  function isLorentzGroup(group){
    return group==="Ansätze / pre-solutions" || String(group||"").indexOf("Catalogue ·")===0;
  }
  function negateEntry(expr){
    var s=String(expr).trim();
    if(s==="0") return "0";
    if(s.charAt(0)==="-") return s.slice(1);
    return "-("+s+")";
  }
  function normalizeCatalogueSource(){
    if(window.__FINSLER_MINUSPLUS_NORMALIZED) return;
    var items=window.FINSLER_METRIC_CATALOGUE||[];
    items.forEach(function(item){
      var originalId=item.id;
      var originalGroup=item.group;
      if(!isLorentzGroup(originalGroup)) return;
      item._minusPlusLorentz=true;
      item.id="minusplus-"+originalId;
      if(originalGroup==="Ansätze / pre-solutions") item.group="Ansätze & pre-solutions";
      else item.group=String(originalGroup).replace(/^Catalogue ·/,"Spacetime catalogue ·");
      if(originalId==="sultana-dyer"){
        item.matrix=item.matrix.map(function(row){return row.map(negateEntry);});
        item.description="Black hole in an Einstein–de Sitter universe, converted from the catalogue's (+---) form to the page-wide (-+++) convention.";
        item.validation="Catalogue curvature check with the global metric sign converted to (-+++)";
      }
    });
    window.__FINSLER_MINUSPLUS_NORMALIZED=true;
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
    var H="x^2-y^2";
    var pp=[[H,"-1","0","0"],["-1","0","0","0"],["0","0","1","0"],["0","0","0","1"]];
    if(select.value==="randerspp"){
      setMatrix(pp);
      if(note) note.textContent="Randers pp-wave in (-+++): ds² = -2 du dv + H du² + dx² + dy², H=x²-y², β=du.";
    }else if(select.value==="ppwaveMetric4"){
      setMatrix(pp);
      if(note) note.textContent="Brinkmann pp-wave in (-+++): ds² = -2 du dv + H du² + dx² + dy².";
    }else if(select.value==="mkropinaPP"){
      setMatrix(pp);
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
      if(!isLorentzCard(card) || card.querySelector(".catalogue-chip.is-signature")) return;
      var meta=card.querySelector(".catalogue-meta");
      if(!meta) return;
      var chip=document.createElement("span");
      chip.className="catalogue-chip is-signature";
      chip.textContent="-+++";
      meta.appendChild(chip);
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

  normalizeCatalogueSource();

  document.addEventListener("click",function(event){
    var loadExample=event.target.closest&&event.target.closest("#loadExample");
    if(loadExample) setTimeout(normalizeQuickExample,0);
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
    setTimeout(function(){
      normalizeQuickExample();
      decorateCatalogue();
      var grid=document.getElementById("catalogueGrid");
      if(grid) new MutationObserver(decorateCatalogue).observe(grid,{childList:true});
    },0);
  });
})();
