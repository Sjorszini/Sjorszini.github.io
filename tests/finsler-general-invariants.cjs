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
const scopes=[
  {x1:.31,x2:.52,y1:.83,y2:1.17,b:.06},
  {x1:.57,x2:-.23,y1:1.22,y2:.71,b:.08},
  {x1:.44,x2:.28,y1:.69,y2:1.34,b:.05},
];
function equal(a,b,label,tol=3e-8){for(const s of scopes){const av=evalNum(a,s),bv=evalNum(b,s),scale=Math.max(1,Math.abs(av),Math.abs(bv));if(!Number.isFinite(av)||!Number.isFinite(bv)||Math.abs(av-bv)>tol*scale)throw new Error(`${label}: ${a} != ${b} (${av} vs ${bv})`);}}
function zero(a,label){equal(a,'0',label);}
function deriv(expr,v){return math.derivative(math.parse(String(expr)),v).toString({parenthesis:'auto'});}
function nonlinear(ms,k,i,j){if(i===j)return'0';if(i<j)return comp(ms,'curvature',`R^{${k}}{}_{${i}${j}}`)||'0';return `-(${comp(ms,'curvature',`R^{${k}}{}_{${j}${i}}`)||'0'})`;}

function auditGeneral(ms,n,name,{expectFlat=false,expectCartanNonzero=false,expectNonzeroN=false}={}){
  const failures=[];const check=fn=>{try{fn();}catch(e){failures.push(`${name}: ${e.message}`);}};
  if(hasSection(ms,'metric')&&hasSection(ms,'inverse')){
    const g=Array.from({length:n},()=>Array(n).fill('0')),gi=Array.from({length:n},()=>Array(n).fill('0'));
    for(let i=1;i<=n;i++)for(let j=i;j<=n;j++){const a=comp(ms,'metric',`g_{${i}${j}}`)||'0',q=comp(ms,'inverse',`g^{${i}${j}}`)||'0';g[i-1][j-1]=g[j-1][i-1]=a;gi[i-1][j-1]=gi[j-1][i-1]=q;}
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){const terms=[];for(let k=0;k<n;k++)terms.push(`(${gi[i][k]})*(${g[k][j]})`);check(()=>equal(terms.join('+'),i===j?'1':'0',`inverse ${i+1}${j+1}`));}
  }
  const cartan=ms.filter(m=>m.type==='component'&&m.section==='cartan');
  if(expectCartanNonzero)check(()=>{if(!cartan.some(m=>{try{return scopes.some(s=>Math.abs(evalNum(m.value,s))>1e-8);}catch(e){return false;}}))throw new Error('expected a nonzero Cartan tensor');});

  if(hasSection(ms,'spray'))for(let k=1;k<=n;k++){
    const G=comp(ms,'spray',`G^{${k}}`)||'0';let euler='0';for(let j=1;j<=n;j++)euler+=`+y${j}*(${deriv(G,`y${j}`)})`;
    check(()=>equal(euler,`2*(${G})`,`spray homogeneity ${k}`));
    if(hasSection(ms,'nonlinear'))for(let j=1;j<=n;j++){const N=comp(ms,'nonlinear',`N^{${k}}{}_{${j}}`)||'0';check(()=>equal(N,`0.5*(${deriv(G,`y${j}`)})`,`N=dG/2 ${k}${j}`));}
  }
  if(expectNonzeroN)check(()=>{
    const entries=ms.filter(m=>m.type==='component'&&m.section==='nonlinear');
    if(!entries.some(m=>scopes.some(s=>{try{return Math.abs(evalNum(m.value,s))>1e-8;}catch(e){return false;}})))throw new Error('expected a nonzero nonlinear connection');
  });

  if(hasSection(ms,'curvature'))for(let k=1;k<=n;k++)for(let i=1;i<=n;i++)for(let j=i+1;j<=n;j++){
    const Nij=comp(ms,'nonlinear',`N^{${k}}{}_{${j}}`)||'0',Nii=comp(ms,'nonlinear',`N^{${k}}{}_{${i}}`)||'0';
    let di=`(${deriv(Nij,`x${i}`)})`,dj=`(${deriv(Nii,`x${j}`)})`;
    for(let a=1;a<=n;a++){
      const Nai=comp(ms,'nonlinear',`N^{${a}}{}_{${i}}`)||'0',Naj=comp(ms,'nonlinear',`N^{${a}}{}_{${j}}`)||'0';
      di+=`-(${Nai})*(${deriv(Nij,`y${a}`)})`;dj+=`-(${Naj})*(${deriv(Nii,`y${a}`)})`;
    }
    check(()=>equal(nonlinear(ms,k,i,j),`(${di})-(${dj})`,`curvature from N ${k}${i}${j}`,1e-7));
  }
  if(hasSection(ms,'deviation'))for(let k=1;k<=n;k++)for(let i=1;i<=n;i++){
    const D=comp(ms,'deviation',`R^{${k}}{}_{${i}}`)||'0';let rhs='0';for(let j=1;j<=n;j++)rhs+=`+(${nonlinear(ms,k,i,j)})*y${j}`;
    check(()=>equal(D,rhs,`deviation ${k}${i}`,1e-7));
  }
  if(hasSection(ms,'ricci')){
    const Ric=comp(ms,'ricci','\\mathrm{Ric}')||'0';let rhs='0';for(let i=1;i<=n;i++)for(let j=1;j<=n;j++)rhs+=`+(${nonlinear(ms,i,i,j)})*y${j}`;
    check(()=>equal(Ric,rhs,'Ric contraction',1e-7));
    let eRic='0';for(let j=1;j<=n;j++)eRic+=`+y${j}*(${deriv(Ric,`y${j}`)})`;check(()=>equal(eRic,`2*(${Ric})`,'Ric homogeneity',1e-7));
    for(let i=1;i<=n;i++)for(let j=i;j<=n;j++){const Rij=comp(ms,'ricci',`R_{${i}${j}}`)||'0';check(()=>equal(Rij,`0.5*(${deriv(deriv(Ric,`y${i}`),`y${j}`)})`,`Ricci Hessian ${i}${j}`,1e-7));}
  }
  if(expectFlat){for(const section of ['spray','nonlinear','curvature','deviation','ricci'])for(const m of ms.filter(x=>x.type==='component'&&x.section===section))check(()=>zero(m.value,`flat ${section} ${m.label}`));}
  if(failures.length)throw new Error(failures.join('\n'));
}

const curvatureSet={metric:true,inverse:true,cartan:true,spray:true,nonlinear:true,connections:false,curvature:true,deviation:true,ricci:true,affine:false};
const light={metric:true,inverse:true,cartan:true,spray:true,nonlinear:true,connections:false,curvature:false,deviation:false,ricci:false,affine:false};

// Non-Riemannian locally Minkowski L: nonzero Cartan, while every connection /
// curvature quantity must vanish. This executes the generic Finsler curvature
// and Ricci paths without the algebraic explosion of an arbitrary x-dependent L.
const quartic=runWorker({n:2,inputType:'lagrangian',L:'sqrt(y1^4+y2^4)',outputs:curvatureSet});
auditGeneral(quartic,2,'quartic locally Minkowski',{expectFlat:true,expectCartanNonzero:true});

// Constant Randers is another genuinely non-Riemannian flat geometry. The
// specialized alpha-beta builder and the direct Hessian route must agree.
const randersBuilder=runWorker({n:2,inputType:'metric',metricEntries:[['1','0'],['0','1']],alphaBeta:{enabled:true,type:'randers',b:['b','0'],m:'1'},outputs:curvatureSet});
const randersDirect=runWorker({n:2,inputType:'lagrangian',L:'(sqrt(y1^2+y2^2)+b*y1)^2',outputs:curvatureSet});
auditGeneral(randersBuilder,2,'constant Randers builder',{expectFlat:true,expectCartanNonzero:true});
auditGeneral(randersDirect,2,'constant Randers direct L',{expectFlat:true,expectCartanNonzero:true});

// Coordinate-dependent Randers is non-Berwald in general. Keep this route at
// spray/N level so CI stays fast, but require a genuinely nonzero N and compare
// the closed-form Randers builder against the independent direct-Lagrangian path.
const varyingBuilder=runWorker({n:2,inputType:'metric',metricEntries:[['1','0'],['0','1']],alphaBeta:{enabled:true,type:'randers',b:['0','b*x1'],m:'1'},outputs:light});
const varyingDirect=runWorker({n:2,inputType:'lagrangian',L:'(sqrt(y1^2+y2^2)+b*x1*y2)^2',outputs:light});
auditGeneral(varyingBuilder,2,'varying Randers builder',{expectCartanNonzero:true,expectNonzeroN:true});
auditGeneral(varyingDirect,2,'varying Randers direct L',{expectCartanNonzero:true,expectNonzeroN:true});

function compareLabels(a,b,sections,name){for(const [section,labels] of Object.entries(sections))for(const label of labels){const x=comp(a,section,label)||'0',y=comp(b,section,label)||'0';equal(x,y,`${name}: ${section} ${label}`,2e-7);}}
const flatRouteSections={
  metric:['g_{11}','g_{12}','g_{22}'],inverse:['g^{11}','g^{12}','g^{22}'],cartan:['C_{111}','C_{112}','C_{122}','C_{222}'],
  spray:['G^{1}','G^{2}'],nonlinear:['N^{1}{}_{1}','N^{1}{}_{2}','N^{2}{}_{1}','N^{2}{}_{2}'],
  curvature:['R^{1}{}_{12}','R^{2}{}_{12}'],deviation:['R^{1}{}_{1}','R^{1}{}_{2}','R^{2}{}_{1}','R^{2}{}_{2}'],ricci:['\\mathrm{Ric}','R_{11}','R_{12}','R_{22}']
};
const lightRouteSections={metric:flatRouteSections.metric,inverse:flatRouteSections.inverse,cartan:flatRouteSections.cartan,spray:flatRouteSections.spray,nonlinear:flatRouteSections.nonlinear};
compareLabels(randersBuilder,randersDirect,flatRouteSections,'constant Randers builder/direct');
compareLabels(varyingBuilder,varyingDirect,lightRouteSections,'varying Randers builder/direct');

console.log('PASS: genuine Finsler homogeneity, generic flat curvature/Ricci, and Randers builder/direct connection invariants all hold');
