const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {performance}=require('perf_hooks');
const math=require('mathjs');
const nerdamer=require('nerdamer-prime/all');

const root=path.resolve(__dirname,'..');
const messages=[];
let context;
function loadScript(spec){
  const clean=String(spec).split('?')[0];
  if(/^https?:/.test(clean)){
    if(clean.includes('mathjs')||clean.includes('nerdamer-prime'))return;
    throw new Error(`Unexpected external importScripts URL: ${spec}`);
  }
  const filename=path.resolve(root,clean);
  vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
}
context=vm.createContext({console,performance,math,nerdamer,setTimeout,clearTimeout,postMessage(m){messages.push(JSON.parse(JSON.stringify(m)));}});
context.self=context;context.globalThis=context;context.importScripts=(...specs)=>specs.forEach(loadScript);
loadScript('finsler-worker-v4-symbolic.js');

const symbolicFunctions=[{token:'__uf0',name:'a',args:['x1'],argLabels:['t']}];
context.onmessage({data:{
  type:'calculate',n:4,inputType:'metric',
  metricEntries:[
    ['-1','0','0','0'],
    ['0','__uf0^2/(1-k*x2^2)','0','0'],
    ['0','0','__uf0^2*x2^2','0'],
    ['0','0','0','__uf0^2*x2^2*sin(x3)^2']
  ],
  alphaBeta:{enabled:false},symbolicFunctions,
  outputs:{metric:true}
}});

const err=messages.find(m=>m.type==='error');
if(err)throw new Error(`FLRW worker error: ${err.message}`);
if(!messages.some(m=>m.type==='done'))throw new Error('FLRW worker did not finish');
const g22=messages.find(m=>m.type==='component'&&m.section==='metric'&&m.label==='g_{22}');
if(!g22||!String(g22.value).includes('__uf0'))throw new Error('FLRW g22 was not emitted with the scale-factor token');
const dy=String(context.D('__uf0^2','y2')).replace(/\s+/g,'');
if(dy!=='0')throw new Error(`a(t) incorrectly depends on fiber coordinate y2: ${dy}`);
const dt=String(context.D('__uf0^2','x1')).replace(/\s+/g,'');
if(!dt.includes('__uf0_d1'))throw new Error(`time derivative of a(t)^2 is missing a'(t): ${dt}`);
if(/_dy|_dNaN|_dundefined/.test(dt))throw new Error(`invalid symbolic derivative token leaked: ${dt}`);
console.log('PASS: FLRW symbolic scale factor is x-dependent but fiber-independent');
