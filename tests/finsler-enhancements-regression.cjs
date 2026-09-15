const fs=require('fs');
const path=require('path');
const math=require('mathjs');
const root=path.resolve(__dirname,'..');
function fail(m){console.error('FAIL:',m);process.exitCode=1;}
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}

const wrapper=read('finsler-ui-v6-fixes.js');
const loader=read('finsler-enhancements-v1.js');
const validation=read('finsler-enhancement-01-validation.js');
const dependencies=read('finsler-enhancement-02-dependencies.js');
const resultTools=read('finsler-enhancement-03-result-tools.js');

if(!/finsler-ui-v6-fixes-core\.js/.test(wrapper)||!/finsler-enhancements-v1\.js/.test(wrapper))fail('enhancement wrapper does not preserve the core fixes and load enhancements');
['finsler-enhancement-01-validation.js','finsler-enhancement-02-dependencies.js','finsler-enhancement-03-result-tools.js'].forEach(name=>{if(!loader.includes(name))fail('enhancement loader missing '+name);});
[
  'math.parse','aria-invalid','setCustomValidity','stopImmediatePropagation','finsler-invalid','metric-entry','oneform-entry','lagrangian','constantsInput','functionsInput','mParameter','FINSLER_VALIDATION_API'
].forEach(token=>{if(!validation.includes(token))fail('validation module missing '+token);});

function expressionError(s){
  if(!String(s).trim())return 'empty';
  try{const n=math.parse(String(s));if(n.isAssignmentNode||n.isFunctionAssignmentNode||n.isBlockNode)return 'assignment';return null;}catch(e){return e.message;}
}
if(expressionError('-(1-r_s/r)'))fail('valid Schwarzschild expression rejected by parser');
if(expressionError('r^2*sin(theta)^2'))fail('valid trig expression rejected by parser');
if(!expressionError('1/(r-r_s'))fail('malformed expression was not rejected');
if(!expressionError('r=1'))fail('assignment was not rejected');
if(!/g_/.test(validation)||!/b_/.test(validation))fail('field-specific tensor labels are absent');

['Computed in the background','metric / fundamental tensor','geodesic spray','nonlinear connection','connection coefficients','nonlinear curvature','FINSLER_DEPENDENCY_API'].forEach(token=>{if(!dependencies.includes(token))fail('dependency hint module missing '+token);});
function dependencyClosure(selected){
  const o={...selected};const need=k=>o[k]=true;
  if(o.inverse)need('metric');if(o.cartan)need('metric');if(o.spray){need('metric');need('inverse');}
  if(o.nonlinear){need('metric');need('inverse');need('spray');}
  if(o.connections){need('metric');need('inverse');need('spray');need('nonlinear');}
  if(o.curvature){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');}
  if(o.deviation){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}
  if(o.ricci){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}
  if(o.affine){need('metric');need('inverse');need('connections');}
  return o;
}
const ricci=dependencyClosure({ricci:true});
['metric','inverse','spray','nonlinear','connections','curvature','ricci'].forEach(k=>{if(!ricci[k])fail('Ricci dependency closure missing '+k);});

['Copy expression','Copy LaTeX','Copy section','Expand all','Collapse all','navigator.clipboard','document.execCommand("copy")','FINSLER_RESULT_TOOLS'].forEach(token=>{if(!resultTools.includes(token))fail('result tools module missing '+token);});
if(!/MutationObserver/.test(resultTools)||!/component-row/.test(resultTools)||!/result-card/.test(resultTools))fail('result tools are not attached progressively');
if(!/dataset\.finslerCopySource/.test(resultTools))fail('result tools do not preserve pre-MathJax formula source');

if(!process.exitCode)console.log('PASS: enhancement layer validates input, explains dependencies, and adds copy/expand result controls');
