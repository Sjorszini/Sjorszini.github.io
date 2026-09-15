const fs=require('fs');
const path=require('path');
const math=require('mathjs');
const root=path.resolve(__dirname,'..');
function fail(m){console.error('FAIL:',m);process.exitCode=1;}
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}

const wrapper=read('finsler-ui-v6-fixes.js');
const loader=read('finsler-enhancements-v1.js');
if(!wrapper.includes('finsler-ui-v6-fixes-core.js')||!wrapper.includes('finsler-enhancements-v1.js'))fail('wrapper does not preserve core fixes and load enhancements');

const modules={
  validation:read('finsler-enhancement-01-validation.js'),
  dependencies:read('finsler-enhancement-02-dependencies.js'),
  results:read('finsler-enhancement-03-result-tools.js'),
  cancel:read('finsler-enhancement-04-cancel.js')
};
Object.keys(modules).forEach((key,i)=>{const n=String(i+1).padStart(2,'0');if(!loader.includes(`finsler-enhancement-${n}-`))fail('loader missing enhancement '+n);});
function expect(source,tokens,label){tokens.forEach(token=>{if(!source.includes(token))fail(`${label} missing ${token}`);});}
expect(modules.validation,['math.parse','aria-invalid','setCustomValidity','stopImmediatePropagation','metric-entry','oneform-entry','lagrangian','constantsInput','functionsInput','FINSLER_VALIDATION_API'],'validation');
expect(modules.dependencies,['Computed in the background','metric / fundamental tensor','geodesic spray','nonlinear connection','connection coefficients','nonlinear curvature','FINSLER_DEPENDENCY_API'],'dependencies');
expect(modules.results,['Copy expression','Copy LaTeX','Copy section','Expand all','Collapse all','navigator.clipboard','finslerCopySource','FINSLER_RESULT_TOOLS'],'result tools');
expect(modules.cancel,['Cancel calculation','finsler-worker','terminate','Calculation cancelled.','Escape','is-busy','FINSLER_CANCEL_API'],'cancel');
if(!/MutationObserver/.test(modules.results)||!/component-row/.test(modules.results)||!/result-card/.test(modules.results))fail('result tools are not progressive');
if(!/MutationObserver/.test(modules.cancel)||!/attributeFilter:\["class"\]/.test(modules.cancel))fail('cancel button does not track busy state');

function expressionError(s){if(!String(s).trim())return 'empty';try{const n=math.parse(String(s));if(n.isAssignmentNode||n.isFunctionAssignmentNode||n.isBlockNode)return 'assignment';return null;}catch(e){return e.message;}}
if(expressionError('-(1-r_s/r)')||expressionError('r^2*sin(theta)^2'))fail('valid expressions rejected');
if(!expressionError('1/(r-r_s')||!expressionError('r=1'))fail('invalid expression accepted');

function dependencyClosure(selected){const o={...selected},need=k=>o[k]=true;if(o.inverse)need('metric');if(o.cartan)need('metric');if(o.spray){need('metric');need('inverse');}if(o.nonlinear){need('metric');need('inverse');need('spray');}if(o.connections){need('metric');need('inverse');need('spray');need('nonlinear');}if(o.curvature){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');}if(o.deviation){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}if(o.ricci){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}if(o.affine){need('metric');need('inverse');need('connections');}return o;}
const ricci=dependencyClosure({ricci:true});['metric','inverse','spray','nonlinear','connections','curvature','ricci'].forEach(k=>{if(!ricci[k])fail('Ricci dependency missing '+k);});

if(!process.exitCode)console.log('PASS: validation, dependency hints, result tools, and cancellation enhancement checks pass');
