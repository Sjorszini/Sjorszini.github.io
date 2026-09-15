const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
function fail(msg){throw new Error(msg);}

const loader=read('finsler-enhancements-v1.js');
const presentation=read('finsler-enhancement-11-preset-presentation.js');
const balls=read('Balls.html');

const iFix=loader.indexOf('finsler-enhancement-11-preset-presentation.js');
const iPrefs=loader.indexOf('finsler-enhancement-08-display-prefs.js');
if(iFix<0)fail('presentation/preset cleanup module is not loaded');
if(iPrefs<0||iFix>iPrefs)fail('display preferences are initialized before the cleanup module can disable them');
[
  'finslerDisplayPrefsV1','finslerDisplayMenu','catalogue-load','constantsInput','functionsInput',
  'finsler-worker-v4-symbolic.js?v=1','Set up your geometry','Calculator','\\\\cdot','y_{'
].forEach(token=>{if(!presentation.includes(token))fail('presentation cleanup missing '+token);});
if(!/replace\(\/\\\\cdot\\s\*\/g,"\\\\,"\)/.test(presentation))fail('multiplication dots are not converted to spacing');
if(!/phi:"\\\\phi"/.test(presentation)||!/eta:"\\\\eta"/.test(presentation)||!/psi:"\\\\psi"/.test(presentation))fail('Greek Hopf fiber labels are not normalized');
if(!/removeItem\(DISPLAY_PREF_KEY\)/.test(presentation)||!/removeDisplayMenu/.test(presentation))fail('display preference dropdown is not disabled');
if(!/loadBallsPreset\('swarm'\)/.test(balls))fail('Balls page does not load the 1,000-ball preset by default');
if(!/<option value="swarm" selected>1,000-ball gravity cloud<\/option>/.test(balls))fail('Balls preset selector does not show the 1,000-ball preset as default');
console.log('PASS: preset cleanup, presentation notation, toolbar wording, hidden display menu, and Balls default are configured');
