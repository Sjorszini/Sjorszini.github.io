const fs=require('fs'),path=require('path'),vm=require('vm');
const {performance}=require('perf_hooks');
const math=require('mathjs');
const root=path.resolve(__dirname,'..'),messages=[];let context;
function load(spec){const clean=String(spec).split('?')[0];if(/^https?:/.test(clean)){if(clean.includes('mathjs'))return;throw new Error(clean);}vm.runInContext(fs.readFileSync(path.join(root,clean),'utf8'),context,{filename:clean});}
context=vm.createContext({console,performance,math,setTimeout,clearTimeout,postMessage:m=>messages.push(JSON.parse(JSON.stringify(m)))});context.self=context;context.globalThis=context;context.importScripts=(...s)=>s.forEach(load);
load('finsler-worker-v3.js');
context.onmessage({data:{type:'calculate',n:4,inputType:'metric',metricEntries:[['-(1-rs/x2)','0','0','0'],['0','1/(1-rs/x2)','0','0'],['0','0','x2^2','0'],['0','0','0','x2^2*sin(x3)^2']],alphaBeta:{enabled:false},outputs:{inverse:true,spray:true,connections:true,affine:true},symbolicFunctions:[]}});
setImmediate(()=>{
 const vals={};for(const m of messages)if(m.type==='component'&&m.section==='affineCurvature')vals[m.label]=String(m.value);
 const expected={'\\bar R^{2}{}_{112}':'rs*(x2-rs)/x2^4','\\bar R^{2}{}_{323}':'-rs/(2*x2)','\\bar R^{2}{}_{424}':'-rs*sin(x3)^2/(2*x2)','\\bar R^{3}{}_{113}':'-rs*(x2-rs)/(2*x2^4)','\\bar R^{3}{}_{223}':'rs/(2*x2^2*(x2-rs))','\\bar R^{3}{}_{434}':'rs*sin(x3)^2/x2','\\bar R^{4}{}_{114}':'-rs*(x2-rs)/(2*x2^4)','\\bar R^{4}{}_{224}':'rs/(2*x2^2*(x2-rs))','\\bar R^{4}{}_{334}':'-rs/x2'};
 let bad=0;for(const [l,w] of Object.entries(expected)){const a=vals[l];const ok=!!a&&math.symbolicEqual(a,w);console.log(l,'=',a,'equal=',ok);if(!ok)bad++;}
 const ricci=messages.filter(m=>m.type==='component'&&m.section==='affineRicci');console.log('Ricci:',ricci.map(m=>m.label+'='+m.value).join('; '));
 const secs=Object.fromEntries(messages.filter(m=>m.type==='sectionComplete').map(m=>[m.section,m.elapsedMs]));console.log('timings',secs);console.log('total',messages.find(m=>m.type==='done')?.totalMs);
 if(bad)process.exitCode=1;
});