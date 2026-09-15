const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {performance}=require('perf_hooks');
const math=require('mathjs');
const nerdamer=require('nerdamer-prime/all');

const root=path.resolve(__dirname,'..');
const messages=[];let context;
function loadScript(spec){
  const clean=String(spec).split('?')[0];
  if(/^https?:/.test(clean)){
    if(clean.includes('mathjs')||clean.includes('nerdamer-prime'))return;
    throw new Error(`Unexpected import: ${spec}`);
  }
  vm.runInContext(fs.readFileSync(path.resolve(root,clean),'utf8'),context,{filename:path.resolve(root,clean)});
}
context=vm.createContext({console,performance,math,nerdamer,setTimeout,clearTimeout,postMessage(m){messages.push(JSON.parse(JSON.stringify(m)));}});
context.self=context;context.globalThis=context;context.importScripts=(...s)=>s.forEach(loadScript);
loadScript('finsler-worker-v4.js');

function compact(s){return String(s).replace(/\s+/g,'');}
function equal(a,b){
  const samples=[
    {x2:7,rs:2,y1:.8,y2:1.1,y3:.4,y4:.3},
    {x2:11,rs:3,y1:1.2,y2:.7,y3:.5,y4:.2},
    {x2:5,rs:1,y1:.6,y2:1.4,y3:.8,y4:.9},
  ];
  return samples.every(s=>{
    const av=Number(math.evaluate(String(a),s)),bv=Number(math.evaluate(String(b),s));
    return Number.isFinite(av)&&Number.isFinite(bv)&&Math.abs(av-bv)<=1e-10*Math.max(1,Math.abs(av),Math.abs(bv));
  });
}

const raw='-rs*x2*y1*y2/(x2^2*rs-x2^3)';
const want='rs*y1*y2/(x2*(x2-rs))';
const computational=context.S(raw);
if(!equal(computational,want))throw new Error(`computational S is wrong: ${computational}`);
if(/x2\s*\^\s*2\s*\*\s*rs\s*-\s*x2\s*\^\s*3/.test(computational))throw new Error(`computational S kept expanded denominator: ${computational}`);
if(compact(computational).length>compact(want).length+4)throw new Error(`computational S is still verbose: ${computational}`);

context.onmessage({data:{
  type:'calculate',n:4,inputType:'metric',
  metricEntries:[
    ['-(1-rs/x2)','0','0','0'],
    ['0','1/(1-rs/x2)','0','0'],
    ['0','0','x2^2','0'],
    ['0','0','0','x2^2*sin(x3)^2'],
  ],
  alphaBeta:{enabled:false},
  outputs:{metric:false,inverse:false,cartan:false,spray:true,nonlinear:false,connections:false,curvature:false,deviation:false,ricci:false,affine:false},
  symbolicFunctions:[],
}});

const err=messages.find(m=>m.type==='error');
if(err)throw new Error(err.message);
const spray=messages.find(m=>m.type==='component'&&m.section==='spray'&&m.label==='G^{1}');
if(!spray)throw new Error('missing Schwarzschild G^{1}');
if(!equal(spray.value,want))throw new Error(`G^t is wrong: ${spray.value}`);
if(/x2\s*\^\s*2\s*\*\s*rs\s*-\s*x2\s*\^\s*3/.test(String(spray.value)))throw new Error(`G^t kept expanded denominator: ${spray.value}`);
if(compact(spray.value).length>compact(want).length+4)throw new Error(`G^t is still verbose: ${spray.value}`);

const summary=messages.find(m=>m.type==='sectionComplete'&&m.section==='spray');
if(!summary||!summary.summary||!Array.isArray(summary.summary.vector))throw new Error('missing spray summary vector');
if(!equal(summary.summary.vector[0],want))throw new Error(`spray summary G^t is wrong/verbose: ${summary.summary.vector[0]}`);
if(/x2\s*\^\s*2\s*\*\s*rs\s*-\s*x2\s*\^\s*3/.test(String(summary.summary.vector[0])))throw new Error(`spray summary kept expanded denominator: ${summary.summary.vector[0]}`);

const timing=Number(summary.elapsedMs||0);
if(!(timing<1000))throw new Error(`spray regression became slow: ${timing} ms`);
console.log('computational S:',computational);
console.log('emitted G^t:',spray.value);
console.log('spray ms:',timing);
console.log('PASS: Schwarzschild G^t is canonically factored/cancelled before downstream use and in output');
