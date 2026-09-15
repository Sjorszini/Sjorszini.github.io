const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const math = require('mathjs');
const nerdamer = require('nerdamer-prime/all');

const root = path.resolve(__dirname, '..');

function runWorker(payload) {
  const messages = [];
  let context;
  function loadScript(spec) {
    const clean = String(spec).split('?')[0];
    if (/^https?:/.test(clean)) {
      if (clean.includes('mathjs') || clean.includes('nerdamer-prime')) return;
      throw new Error(`Unexpected external importScripts URL: ${spec}`);
    }
    const filename = path.resolve(root, clean);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  context = vm.createContext({
    console,
    performance,
    math,
    nerdamer,
    setTimeout,
    clearTimeout,
    postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); },
  });
  context.self = context;
  context.globalThis = context;
  context.importScripts = (...specs) => specs.forEach(loadScript);
  loadScript('finsler-worker-v4.js');
  context.onmessage({ data: Object.assign({ type: 'calculate', symbolicFunctions: [] }, payload) });
  const err = messages.find(m => m.type === 'error');
  if (err) throw new Error(err.message);
  if (!messages.some(m => m.type === 'done')) throw new Error('worker did not finish');
  return messages;
}

function compact(x) { return String(x).replace(/\s+/g, ''); }
function component(messages, section, label) {
  const m = messages.find(x => x.type === 'component' && x.section === section && x.label === label);
  return m ? String(m.value) : null;
}
function evalExpr(expr, scope) { return Number(math.evaluate(String(expr), scope)); }
function close(a, b, scope, label, tol = 2e-8) {
  const av = evalExpr(a, scope), bv = evalExpr(b, scope);
  const scale = Math.max(1, Math.abs(av), Math.abs(bv));
  if (!Number.isFinite(av) || !Number.isFinite(bv) || Math.abs(av - bv) > tol * scale) {
    throw new Error(`${label}: ${a} != ${b} at ${JSON.stringify(scope)} (${av} vs ${bv})`);
  }
}
function samples(extra) {
  return [
    Object.assign({ x1:0.71, x2:0.33, y1:0.47, y2:-0.82, H:0.4 }, extra || {}),
    Object.assign({ x1:1.09, x2:-0.21, y1:-0.61, y2:0.54, H:0.27 }, extra || {}),
    Object.assign({ x1:0.92, x2:0.41, y1:0.33, y2:0.76, H:0.51 }, extra || {}),
  ];
}
function compareExpr(a,b,label,extra) { for (const s of samples(extra)) close(a,b,s,label); }

function gamma(messages,k,i,j) {
  const a=Math.min(i,j), b=Math.max(i,j);
  return component(messages,'christoffel',`\\Gamma^{${k}}{}_{${a}${b}}`) || '0';
}
function nonlinear(messages,k,i,j) {
  if(i===j) return '0';
  if(i<j) return component(messages,'curvature',`R^{${k}}{}_{${i}${j}}`) || '0';
  const v=component(messages,'curvature',`R^{${k}}{}_{${j}${i}}`) || '0';
  return `-(${v})`;
}
function affine(messages,k,l,i,j) {
  if(i===j) return '0';
  if(i<j) return component(messages,'affineCurvature',`\\bar R^{${k}}{}_{${l}${i}${j}}`) || '0';
  const v=component(messages,'affineCurvature',`\\bar R^{${k}}{}_{${l}${j}${i}}`) || '0';
  return `-(${v})`;
}
function affineRicci(messages,i,j) {
  return component(messages,'affineRicci',`\\bar R_{${i}${j}}`) || '0';
}
function finslerRicciTensor(messages,i,j) {
  const a=Math.min(i,j), b=Math.max(i,j);
  return component(messages,'ricci',`R_{${a}${b}}`) || '0';
}

function auditRiemannian(messages,n,name,known) {
  const failures=[];
  function check(fn){try{fn();}catch(e){failures.push(`${name}: ${e.message}`);}}

  // g^{ik} g_{kj} = delta^i_j.
  const g=Array.from({length:n},()=>Array(n).fill('0'));
  const gi=Array.from({length:n},()=>Array(n).fill('0'));
  for(let i=1;i<=n;i++)for(let j=i;j<=n;j++){
    const m=component(messages,'metric',`g_{${i}${j}}`)||'0';
    const q=component(messages,'inverse',`g^{${i}${j}}`)||'0';
    g[i-1][j-1]=g[j-1][i-1]=m;
    gi[i-1][j-1]=gi[j-1][i-1]=q;
  }
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const terms=[];for(let k=0;k<n;k++)terms.push(`(${gi[i][k]})*(${g[k][j]})`);
    check(()=>compareExpr(terms.join('+'),i===j?'1':'0',`inverse identity ${i+1}${j+1}`));
  }

  // Quadratic/Riemannian geometries have zero Cartan tensor.
  for(const m of messages.filter(m=>m.type==='component'&&m.section==='cartan')){
    check(()=>compareExpr(m.value,'0',`Cartan ${m.label}`));
  }

  // G^k = Gamma^k_ij y^i y^j and N^k_i = Gamma^k_ij y^j = 1/2 dG^k/dy^i.
  for(let k=1;k<=n;k++){
    const G=component(messages,'spray',`G^{${k}}`)||'0';
    const gTerms=[];
    for(let i=1;i<=n;i++)for(let j=1;j<=n;j++)gTerms.push(`(${gamma(messages,k,i,j)})*y${i}*y${j}`);
    check(()=>compareExpr(G,gTerms.join('+'),`spray/Christoffel k=${k}`));
    for(let i=1;i<=n;i++){
      const N=component(messages,'nonlinear',`N^{${k}}{}_{${i}}`)||'0';
      const nTerms=[];for(let j=1;j<=n;j++)nTerms.push(`(${gamma(messages,k,i,j)})*y${j}`);
      check(()=>compareExpr(N,nTerms.join('+'),`N/Gamma k=${k},i=${i}`));
      let dG='0';try{dG=math.derivative(math.parse(G),`y${i}`).toString({parenthesis:'auto'});}catch(e){failures.push(`${name}: cannot differentiate G^${k}: ${e.message}`);}
      check(()=>compareExpr(N,`0.5*(${dG})`,`N/dG k=${k},i=${i}`));
    }
  }

  // R^k_ij = Rbar^k_lij y^l.
  for(let k=1;k<=n;k++)for(let i=1;i<=n;i++)for(let j=i+1;j<=n;j++){
    const R=nonlinear(messages,k,i,j);
    const terms=[];for(let l=1;l<=n;l++)terms.push(`(${affine(messages,k,l,i,j)})*y${l}`);
    check(()=>compareExpr(R,terms.join('+'),`nonlinear/affine R ${k}${i}${j}`));
  }

  // Jacobi/deviation tensor is the contraction R^k_ij y^j.
  for(let k=1;k<=n;k++)for(let i=1;i<=n;i++){
    const D=component(messages,'deviation',`R^{${k}}{}_{${i}}`)||'0';
    const terms=[];for(let j=1;j<=n;j++)terms.push(`(${nonlinear(messages,k,i,j)})*y${j}`);
    check(()=>compareExpr(D,terms.join('+'),`deviation contraction ${k}${i}`));
  }

  // In the affine/Riemannian path, Ric(x,y) = Rbar_ij y^i y^j and
  // the Finsler Ricci tensor is exactly the affine Ricci tensor.
  const Ric=component(messages,'ricci','\\mathrm{Ric}')||'0';
  const ricTerms=[];
  for(let i=1;i<=n;i++)for(let j=1;j<=n;j++)ricTerms.push(`(${affineRicci(messages,i,j)})*y${i}*y${j}`);
  check(()=>compareExpr(Ric,ricTerms.join('+'),'Ric/affine-Ricci contraction'));
  for(let i=1;i<=n;i++)for(let j=1;j<=n;j++){
    check(()=>compareExpr(affineRicci(messages,i,j),affineRicci(messages,j,i),`affine Ricci symmetry ${i}${j}`));
    check(()=>compareExpr(finslerRicciTensor(messages,i,j),affineRicci(messages,i,j),`Finsler/affine Ricci ${i}${j}`));
  }

  if(known){
    if(known.ricci){for(const [key,expr] of Object.entries(known.ricci)){const [i,j]=key.split(',').map(Number);check(()=>compareExpr(affineRicci(messages,i,j),expr,`known Ricci ${key}`));}}
    if(known.Ric)check(()=>compareExpr(Ric,known.Ric,'known Ric(x,y)'));
  }

  if(failures.length)throw new Error(failures.join('\n'));
}

const allOutputs={metric:true,inverse:true,cartan:true,spray:true,nonlinear:true,connections:true,curvature:true,deviation:true,ricci:true,affine:true};
const sphereMetric={
  n:2,inputType:'metric',metricEntries:[['1','0'],['0','sin(x1)^2']],alphaBeta:{enabled:false},outputs:allOutputs
};
const sphereLag={
  n:2,inputType:'lagrangian',L:'y1^2+sin(x1)^2*y2^2',outputs:allOutputs
};
const sphereRandersZero={
  n:2,inputType:'metric',metricEntries:[['1','0'],['0','sin(x1)^2']],alphaBeta:{enabled:true,type:'randers',b:['0','0'],m:'1'},outputs:allOutputs
};
const dS2={
  n:2,inputType:'metric',metricEntries:[['-1','0'],['0','exp(2*H*x1)']],alphaBeta:{enabled:false},outputs:allOutputs
};

const sphere=runWorker(sphereMetric);
auditRiemannian(sphere,2,'round S2',{ricci:{'1,1':'1','1,2':'0','2,2':'sin(x1)^2'},Ric:'y1^2+sin(x1)^2*y2^2'});
const lag=runWorker(sphereLag);
auditRiemannian(lag,2,'round S2 direct L',{ricci:{'1,1':'1','1,2':'0','2,2':'sin(x1)^2'},Ric:'y1^2+sin(x1)^2*y2^2'});
const randers0=runWorker(sphereRandersZero);
auditRiemannian(randers0,2,'Randers beta=0',{ricci:{'1,1':'1','1,2':'0','2,2':'sin(x1)^2'},Ric:'y1^2+sin(x1)^2*y2^2'});
const ds=runWorker(dS2);
auditRiemannian(ds,2,'2D de Sitter',{ricci:{'1,1':'-H^2','1,2':'0','2,2':'H^2*exp(2*H*x1)'},Ric:'H^2*(-y1^2+exp(2*H*x1)*y2^2)'});

// Cross-route equality: the same Riemannian geometry entered in three supported
// ways must return the same connection/curvature/Ricci data.
for(const [section,labels] of Object.entries({
  spray:['G^{1}','G^{2}'],
  nonlinear:['N^{1}{}_{1}','N^{1}{}_{2}','N^{2}{}_{1}','N^{2}{}_{2}'],
  christoffel:['\\Gamma^{1}{}_{11}','\\Gamma^{1}{}_{12}','\\Gamma^{1}{}_{22}','\\Gamma^{2}{}_{11}','\\Gamma^{2}{}_{12}','\\Gamma^{2}{}_{22}'],
  affineRicci:['\\bar R_{11}','\\bar R_{12}','\\bar R_{21}','\\bar R_{22}'],
  ricci:['\\mathrm{Ric}','R_{11}','R_{12}','R_{22}']
})){
  for(const label of labels){
    const a=component(sphere,section,label)||'0',b=component(lag,section,label)||'0',c=component(randers0,section,label)||'0';
    compareExpr(a,b,`metric/direct-L equality ${section} ${label}`);
    compareExpr(a,c,`metric/Randers-beta0 equality ${section} ${label}`);
  }
}

console.log('PASS: inverse, Cartan, spray/N/Gamma, affine/nonlinear curvature, deviation, Ricci contraction, known curvature, and cross-input invariants all hold');
