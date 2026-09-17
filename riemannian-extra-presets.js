(function(){
  "use strict";

  var EXTRA_PRESETS=[
    {
      id:"spherical-general",
      name:"General static spherical metric",
      n:4,
      coords:["t","r","theta","phi"],
      constants:"",
      functions:"A(r), B(r)",
      note:"General static spherically symmetric metric: ds² = -A(r)dt² + B(r)dr² + r²dΩ².",
      matrix:[["-A(r)","0","0","0"],["0","B(r)","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]
    },
    {
      id:"reissner-nordstrom",
      name:"Reissner–Nordström spacetime",
      n:4,
      coords:["t","r","theta","phi"],
      constants:"M, Q",
      functions:"",
      note:"Static charged black hole in geometrized units, with f(r)=1-2M/r+Q²/r².",
      matrix:[["-(1-2*M/r+Q^2/r^2)","0","0","0"],["0","1/(1-2*M/r+Q^2/r^2)","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]
    },
    {
      id:"desitter-static",
      name:"de Sitter spacetime (static patch)",
      n:4,
      coords:["t","r","theta","phi"],
      constants:"Lambda",
      functions:"",
      note:"Static patch of de Sitter spacetime with f(r)=1-Λr²/3.",
      matrix:[["-(1-Lambda*r^2/3)","0","0","0"],["0","1/(1-Lambda*r^2/3)","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]
    },
    {
      id:"ads-static",
      name:"anti-de Sitter spacetime (static)",
      n:4,
      coords:["t","r","theta","phi"],
      constants:"L",
      functions:"",
      note:"Static global anti-de Sitter form with curvature radius L: f(r)=1+r²/L².",
      matrix:[["-(1+r^2/L^2)","0","0","0"],["0","1/(1+r^2/L^2)","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]
    },
    {
      id:"kerr-bl",
      name:"Kerr spacetime (Boyer–Lindquist)",
      n:4,
      coords:["t","r","theta","phi"],
      constants:"M, a",
      functions:"",
      defaultOutputs:["metric","inverse","christoffel"],
      note:"Rotating vacuum black hole in Boyer–Lindquist coordinates, with Σ=r²+a²cos²θ and Δ=r²-2Mr+a². Loads with metric, inverse and Christoffels selected; curvature can be enabled explicitly.",
      matrix:[
        ["-(1-2*M*r/(r^2+a^2*cos(theta)^2))","0","0","-2*M*a*r*sin(theta)^2/(r^2+a^2*cos(theta)^2)"],
        ["0","(r^2+a^2*cos(theta)^2)/(r^2-2*M*r+a^2)","0","0"],
        ["0","0","r^2+a^2*cos(theta)^2","0"],
        ["-2*M*a*r*sin(theta)^2/(r^2+a^2*cos(theta)^2)","0","0","sin(theta)^2*(r^2+a^2+2*M*a^2*r*sin(theta)^2/(r^2+a^2*cos(theta)^2))"]
      ]
    },
    {
      id:"schwarzschild-ef",
      name:"Schwarzschild (ingoing Eddington–Finkelstein)",
      n:4,
      coords:["v","r","theta","phi"],
      constants:"r_s",
      functions:"",
      note:"Schwarzschild geometry in horizon-penetrating ingoing Eddington–Finkelstein coordinates.",
      matrix:[["-(1-r_s/r)","1","0","0"],["1","0","0","0"],["0","0","r^2","0"],["0","0","0","r^2*sin(theta)^2"]]
    },
    {
      id:"godel",
      name:"Gödel universe",
      n:4,
      coords:["t","x","y","z"],
      constants:"L",
      functions:"",
      note:"Gödel rotating cosmology in a standard Cartesian-like chart; the t–z block carries the characteristic rotation.",
      matrix:[["-L^2","0","0","-L^2*exp(x)"],["0","L^2","0","0"],["0","0","L^2","0"],["-L^2*exp(x)","0","0","-L^2*exp(2*x)/2"]]
    },
    {
      id:"ellis-wormhole",
      name:"Ellis wormhole",
      n:4,
      coords:["t","l","theta","phi"],
      constants:"b",
      functions:"",
      note:"Ultrastatic Ellis drainhole in proper radial coordinate l, with throat radius b.",
      matrix:[["-1","0","0","0"],["0","1","0","0"],["0","0","l^2+b^2","0"],["0","0","0","(l^2+b^2)*sin(theta)^2"]]
    },
    {
      id:"rindler",
      name:"Rindler spacetime",
      n:4,
      coords:["t","x","y","z"],
      constants:"alpha",
      functions:"",
      note:"Flat spacetime in uniformly accelerated coordinates: ds²=-(αx)²dt²+dx²+dy²+dz².",
      matrix:[["-alpha^2*x^2","0","0","0"],["0","1","0","0"],["0","0","1","0"],["0","0","0","1"]]
    },
    {
      id:"alcubierre",
      name:"Alcubierre warp-drive ansatz",
      n:4,
      coords:["t","x","y","z"],
      constants:"v",
      functions:"F(t,x,y,z)",
      note:"ADM-form warp-drive ansatz with symbolic shape function F: ds²=-dt²+[dx-vF dt]²+dy²+dz².",
      matrix:[["-(1-v^2*F(t,x,y,z)^2)","-v*F(t,x,y,z)","0","0"],["-v*F(t,x,y,z)","1","0","0"],["0","0","1","0"],["0","0","0","1"]]
    },
    {
      id:"bianchi-i",
      name:"Bianchi I cosmology",
      n:4,
      coords:["t","x","y","z"],
      constants:"",
      functions:"a(t), b(t), c(t)",
      note:"Homogeneous anisotropic Bianchi I spacetime with three independent directional scale factors.",
      matrix:[["-1","0","0","0"],["0","a(t)^2","0","0"],["0","0","b(t)^2","0"],["0","0","0","c(t)^2"]]
    },
    {
      id:"kasner",
      name:"Kasner spacetime",
      n:4,
      coords:["t","x","y","z"],
      constants:"p_1, p_2, p_3",
      functions:"",
      note:"Kasner form ds²=-dt²+t^{2p₁}dx²+t^{2p₂}dy²+t^{2p₃}dz². It is vacuum when Σpᵢ=Σpᵢ²=1.",
      matrix:[["-1","0","0","0"],["0","t^(2*p_1)","0","0"],["0","0","t^(2*p_2)","0"],["0","0","0","t^(2*p_3)"]]
    },
    {
      id:"btz-rotating",
      name:"Rotating BTZ black hole",
      n:3,
      coords:["t","r","phi"],
      constants:"M, J, L",
      functions:"",
      note:"Rotating (2+1)-dimensional BTZ black hole with AdS radius L; a compact off-diagonal 3D example.",
      matrix:[["M-r^2/L^2","0","-J/2"],["0","1/(-M+r^2/L^2+J^2/(4*r^2))","0"],["-J/2","0","r^2"]]
    }
  ];
  var byId=Object.create(null);
  EXTRA_PRESETS.forEach(function(p){byId[p.id]=p;});

  function el(id){return document.getElementById(id);}
  function setStatus(text,type){var node=el("status");if(!node)return;node.textContent=text;node.className="calc-status"+(type?" is-"+type:"");}
  function event(name){return new Event(name,{bubbles:true});}

  function appendOptions(){
    var select=el("presetSelect");if(!select)return;
    var group=document.createElement("optgroup");group.label="More geometries";
    EXTRA_PRESETS.forEach(function(p){var option=document.createElement("option");option.value=p.id;option.textContent=p.name;group.appendChild(option);});
    select.appendChild(group);
  }

  function setMetricCell(i,j,value){
    var input=document.querySelector('.metric-entry[data-i="'+i+'"][data-j="'+j+'"]');
    if(!input)throw new Error("Missing metric entry "+i+","+j);
    input.value=value;input.dispatchEvent(event("input"));
  }

  function loadExtraPreset(p){
    var select=el("presetSelect"),dimension=el("dimension");
    select.value=p.id;
    dimension.value=String(p.n);dimension.dispatchEvent(event("change"));

    var coordInputs=document.querySelectorAll(".coordinate-input");
    p.coords.forEach(function(name,i){coordInputs[i].value=name;coordInputs[i].dispatchEvent(event("change"));});

    el("constantsInput").value=p.constants;el("constantsInput").dispatchEvent(event("change"));
    el("functionsInput").value=p.functions;el("functionsInput").dispatchEvent(event("change"));

    for(var i=0;i<p.n;i++)for(var j=0;j<p.n;j++)setMetricCell(i,j,p.matrix[i][j]);
    var first=document.querySelector(".metric-entry");if(first)first.dispatchEvent(event("change"));

    el("presetNote").textContent=p.note;
    if(p.defaultOutputs){
      document.querySelectorAll("[data-output]").forEach(function(box){
        box.checked=p.defaultOutputs.indexOf(box.dataset.output)>=0;
        box.dispatchEvent(event("change"));
      });
    }
    if(el("clearResults"))el("clearResults").click();
    setStatus("Loaded "+p.name+".","success");
  }

  function restoreExtraSelection(){
    try{
      var raw=localStorage.getItem("riemannianCalculatorState");if(!raw)return;
      var state=JSON.parse(raw),p=state&&byId[state.preset];if(!p)return;
      el("presetSelect").value=p.id;el("presetNote").textContent=p.note;
    }catch(e){}
  }

  function init(){
    var select=el("presetSelect"),load=el("loadPreset");if(!select||!load)return;
    appendOptions();restoreExtraSelection();

    select.addEventListener("change",function(e){
      var p=byId[select.value];if(!p)return;
      e.stopImmediatePropagation();el("presetNote").textContent=p.note;
    },true);

    load.addEventListener("click",function(e){
      var p=byId[select.value];if(!p)return;
      e.preventDefault();e.stopImmediatePropagation();loadExtraPreset(p);
    },true);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
