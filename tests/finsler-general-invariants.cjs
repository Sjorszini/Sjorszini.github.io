const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {performance}=require('perf_hooks');
const math=require('mathjs');
const nerdamer=require('nerdamer-prime/all');
const root=path.resolve(__dirname,'..');

function runWorker(payload){
  const messages=[];let context;
  function loadScript(spec){
    const clean=String(spec).split('?')[0];
    if(/^https?:/.test(clean)){if(clean.includes('mathjs')||clean.includes('nerdamer-prime'))return;throw new Error(`Unexpected import: ${spec}`);}
    vm.runInContext(fs.readFileSync(path.resolve(root,clean),'utf8'),context,{filename:path.resolve(root,clean)});
  }
  context=vm.createContext({console,performance,math,nerdamer,setTimeout,clearTimeout,postMessage(m){messages.push(JSON.parse(JSON.stringify(m)));}});
  context.self=context;context.globalThis=context;context.importScripts=(...s)=>s.forEach(loadScript);
  loadScript('finsler-worker-v4.js');
  context.onmessage({data:Object.assign({type:'calculate',symbolicFunctions:[]},payload)});
  const err=messages.find(m=>m.type==='error');if(err)throw new Error(err.message);
  if(!messages.some(m=>m.type==='done'))throw new Error('worker did not finish');
  return messages;
}
function comp(ms,section,label){const m=ms.find(x=>x.type==='component'&&x.section===section&&x.label===label);return m?String(m.value):null;}
function hasSection(ms,section){return ms.some(m=>m.type==='component'&&m.section===section);}
function evalNum(expr,scope){return Number(math.evaluate(String(expr),scope));}
const scopes=[{y1:.83,y2:1.17,b:.06},{y1:1.22,y2:.71,b:.08},{y1:.69,y2:1.34,b:.05}];
function equal(a,b,label,tol=3e-8){for(const s of scopes){const av=evalNum(a,s),bv=evalNum(b,s),scale=Math.max(1,Math.abs(av),Math.abs(bv));if(!Number.isFinite(av)||!Number.isFinite(bv)||Math.abs(av-bv)>tol*scale)throw new Error(`${label}: ${a} != ${b} (${av} vs ${bv})`);}}
function zero(a,label){equal(a,'0',label);}
function deriv(expr,v){return math.derivative(math.parse(String(expr)),v).toString({parenthesis:'auto'});}
function nonlinear(ms,k,i,j){if(i===j)return'0';if(i<j)return comp(ms,'curvature',`R^{${k}}{}_{${i}${j}}`)||'0';return `-(${comp(ms,'curvature',`R^{${k}}{}_{${j}${i}}`)||'0'})`;}

function audit(ms,n,name,{expectFlat=false,expectCartanNonzero=false,lagrangian=null}={}){
  const failures=[];const check=fn=>{try{fn();}catch(e){failures.push(`${name}: ${e.message}`);}};
  const g=Array.from({length:n},()=>Array(n).fill('0')),gi=Array.from({length:n},()=>Array(n).fill('0'));
  if(hasSection(ms,'metric')&&hasSection(ms,'inverse')){
    for(let i=1;i<=n;i++)for(let j=i;j<=n;j++){const a=comp(ms,'metric',`g_{${i}${j}}`)||'0',q=comp(ms,'inverse',`g^{${i}${j}}`)||'0';g[i-1][j-1]=g[j-1][i-1]=a;gi[i-1][j-1]=gi[j-1][i-1]=q;}
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){const t=[];for(let k=0;k<n;k++)t.push(`(${gi[i][k]})*(${g[k][j]})`);check(()=>equal(t.join('+'),i===j?'1':'0',`inverse ${i+1}${j+1}`));}
    const det=comp(ms,'inverse','\\det(g)');if(n===2&&det)check(()=>equal(det,`(${g[0][0]})*(${g[1][1]})-(${g[0][1]})*(${g[1][0]})`,'determinant'));
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){let e='0';for(let a=1;a<=n;a++)e+=`+y${a}*(${deriv(g[i][j],`y${a}`)})`;check(()=>zero(e,`metric 0-homogeneity ${i+1}${j+1}`));}
    if(lagrangian){let r='0';for(let i=0;i<n;i++)for(let j=0;j<n;j++)r+=`+(${g[i][j]})*y${i+1}*y${j+1}`;check(()=>equal(r,lagrangian,'L=g_ij y^i y^j',1e-7));}
  }
  const cartan=ms.filter(m=>m.type==='component'&&m.section==='cartan');
  for(const m of cartan){const h=/C_\{(\d)(\d)(\d)\}/.exec(m.label);if(!h)continue;const i=+h[1],j=+h[2],k=+h[3];check(()=>equal(m.value,`0.5*(${deriv(g[j-1][k-1],`y${i}`)})`,`Cartan ${m.label}`,1e-7));}
  if(expectCartanNonzero)check(()=>{if(!cartan.some(m=>scopes.some(s=>Math.abs(evalNum(m.value,s))>1e-8)))throw new Error('expected nonzero Cartan tensor');});

  if(hasSection(ms,'spray'))for(let k=1;k<=n;k++){
    const G=comp(ms,'spray',`G^{${k}}`)||'0';let e='0';for(let j=1;j<=n;j++)e+=`+y${j}*(${deriv(G,`y${j}`)})`;check(()=>equal(e,`2*(${G})`,`spray homogeneity ${k}`));
    if(hasSection(ms,'nonlinear'))for(let j=1;j<=n;j++){const N=comp(ms,'nonlinear',`N^{${k}}{}_{${j}}`)||'0';check(()=>equal(N,`0.5*(${deriv(G,`y${j}`)})`,`N=dG/2 ${k}${j}`));}
  }
  if(hasSection(ms,'curvature'))for(let k=1;k<=n;k++)for(let i=1;i<=n;i++)for(let j=i+1;j<=n;j++){
    const Nij=comp(ms,'nonlinear',`N^{${k}}{}_{${j}}`)||'0',Nii=comp(ms,'nonlinear',`N^{${k}}{}_{${i}}`)||'0';
    let di=`(${deriv(Nij,`x${i}`)})`,dj=`(${deriv(Nii,`x${j}`)})`;for(let a=1;a<=n;a++){const Nai=comp(ms,'nonlinear',`N^{${a}}{}_{${i}}`)||'0',Naj=comp(ms,'nonlinear',`N^{${a}}{}_{${j}}`)||'0';di+=`-(${Nai})*(${deriv(Nij,`y${a}`)})`;dj+=`-(${Naj})*(${deriv(Nii,`y${a}`)})`;}
    check(()=>equal(nonlinear(ms,k,i,j),`(${di})-(${dj})`,`curvature from N ${k}${i}${j}`,1e-7));
  }
  if(hasSection(ms,'deviation'))for(let k=1;k<=n;k++)for(let i=1;i<=n;i++){const D=comp(ms,'deviation',`R^{${k}}{}_{${i}}`)||'0';let r='0';for(let j=1;j<=n;j++)r+=`+(${nonlinear(ms,k,i,j)})*y${j}`;check(()=>equal(D,r,`deviation ${k}${i}`,1e-7));}
  if(hasSection(ms,'ricci')){const Ric=comp(ms,'ricci','\\mathrm{Ric}')||'0';let r='0';for(let i=1;i<=n;i++)for(let j=1;j<=n;j++)r+=`+(${nonlinear(ms,i,i,j)})*y${j}`;check(()=>equal(Ric,r,'Ric contraction',1e-7));for(let i=1;i<=n;i++)for(let j=i;j<=n;j++){const Rij=comp(ms,'ricci',`R_{${i}${j}}`)||'0';check(()=>equal(Rij,`0.5*(${deriv(deriv(Ric,`y${i}`),`y${j}`)})`,`Ricci Hessian ${i}${j}`,1e-7));}}
  if(expectFlat)for(const section of ['spray','nonlinear','curvature','deviation','ricci'])for(const m of ms.filter(x=>x.type==='component'&&x.section===section))check(()=>zero(m.value,`flat ${section} ${m.label}`));
  if(failures.length)throw new Error(failures.join('\n'));
}

const full={metric:true,inverse:true,cartan:true,spray:true,nonlinear:true,connections:false,curvature:true,deviation:true,ricci:true,affine:false};
const tensorOnly={metric:true,inverse:true,cartan:true,spray:false,nonlinear:false,connections:false,curvature:false,deviation:false,ricci:false,affine:false};

// Simple regular 2-homogeneous pseudo-Finsler fixture: nonzero Cartan, but no
// x-dependence, hence all spray/connection/curvature/Ricci quantities vanish.
const simpleL='y1^3/y2';
const simple=runWorker({n:2,inputType:'lagrangian',L:simpleL,outputs:full});
audit(simple,2,'simple locally Minkowski pseudo-Finsler',{expectFlat:true,expectCartanNonzero:true,lagrangian:simpleL});

// Independent Randers implementations: closed-form alpha-beta formulas versus
// direct Hessian of F^2. Restrict to the tensors defining the Finsler structure;
// the generic connection/curvature path is already exercised above.
const randersL='(sqrt(y1^2+y2^2)+b*y1)^2';
const builder=runWorker({n:2,inputType:'metric',metricEntries:[['1','0'],['0','1']],alphaBeta:{enabled:true,type:'randers',b:['b','0'],m:'1'},outputs:tensorOnly});
const direct=runWorker({n:2,inputType:'lagrangian',L:randersL,outputs:tensorOnly});
audit(builder,2,'constant Randers builder',{expectCartanNonzero:true,lagrangian:randersL});
audit(direct,2,'constant Randers direct L',{expectCartanNonzero:true,lagrangian:randersL});
for(const [section,labels] of Object.entries({metric:['g_{11}','g_{12}','g_{22}'],inverse:['g^{11}','g^{12}','g^{22}'],cartan:['C_{111}','C_{112}','C_{122}','C_{222}']}))for(const label of labels)equal(comp(builder,section,label)||'0',comp(direct,section,label)||'0',`Randers builder/direct ${section} ${label}`,2e-7);

console.log('PASS: Finsler metric/Cartan definitions, homogeneity, generic flat spray/curvature/Ricci, and independent Randers tensor implementations all hold');
