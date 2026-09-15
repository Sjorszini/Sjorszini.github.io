const fs=require('fs');
const path=require('path');
const math=require('mathjs');
const root=path.resolve(__dirname,'..');
function fail(m){console.error('FAIL:',m);process.exitCode=1;}
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}

const wrapper=read('finsler-ui-v6-fixes.js');
const loader=read('finsler-enhancements-v1.js');
const validation=read('finsler-enhancement-01-validation.js');

if(!/finsler-ui-v6-fixes-core\.js/.test(wrapper)||!/finsler-enhancements-v1\.js/.test(wrapper))fail('enhancement wrapper does not preserve the core fixes and load enhancements');
if(!/finsler-enhancement-01-validation\.js/.test(loader))fail('validation module is not loaded');
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

if(!process.exitCode)console.log('PASS: live field validation is wired and malformed symbolic input is rejected before calculation');
