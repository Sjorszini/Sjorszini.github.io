const fs=require('fs');
const path=require('path');
const math=require('mathjs');
const root=path.resolve(__dirname,'..');
function fail(m){console.error('FAIL:',m);process.exitCode=1;}
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
const wrapper=read('finsler-ui-v6-fixes.js'),loader=read('finsler-enhancements-v1.js');
if(!wrapper.includes('finsler-ui-v6-fixes-core.js')||!wrapper.includes('finsler-enhancements-v1.js'))fail('wrapper does not preserve core fixes and load enhancements');
const files=['finsler-enhancement-01-validation.js','finsler-enhancement-02-dependencies.js','finsler-enhancement-03-result-tools.js','finsler-enhancement-04-cancel.js','finsler-enhancement-05-share-state.js','finsler-enhancement-06-catalogue-tags.js','finsler-enhancement-07-mobile-flow.js','finsler-enhancement-08-display-prefs.js'];
files.forEach(name=>{if(!loader.includes(name))fail('loader missing '+name);});
const m={validation:read(files[0]),dependencies:read(files[1]),results:read(files[2]),cancel:read(files[3]),share:read(files[4]),catalogue:read(files[5]),mobile:read(files[6]),display:read(files[7])};
function expect(source,tokens,label){tokens.forEach(token=>{if(!source.includes(token))fail(`${label} missing ${token}`);});}
expect(m.validation,['math.parse','aria-invalid','setCustomValidity','stopImmediatePropagation','metric-entry','oneform-entry','lagrangian','constantsInput','functionsInput','FINSLER_VALIDATION_API'],'validation');
expect(m.dependencies,['Computed in the background','metric / fundamental tensor','geodesic spray','nonlinear connection','connection coefficients','nonlinear curvature','FINSLER_DEPENDENCY_API'],'dependencies');
expect(m.results,['Copy expression','Copy LaTeX','Copy section','Expand all','Collapse all','navigator.clipboard','finslerCopySource','FINSLER_RESULT_TOOLS'],'result tools');
expect(m.cancel,['Cancel calculation','finsler-worker','terminate','Calculation cancelled.','Escape','is-busy','FINSLER_CANCEL_API'],'cancel');
expect(m.share,['Copy setup link','encodeState','decodeState','location.hash','dimension','coords','inputMode','geometryMode','lagrangian','metric','oneForm','alphaBetaType','constants','functions','outputs','FINSLER_SHARE_API'],'share state');
expect(m.catalogue,['All math tags','Ricci-flat / vacuum','constant curvature','black hole','cosmology','axisymmetric','α–β','catalogueTagFilter','finslerSearch','finslerTags','FINSLER_CATALOGUE_TAG_API'],'catalogue tags');
expect(m.mobile,['Calculator workflow','Notation','Input','Outputs','Calculate','Results','IntersectionObserver','scrollIntoView','aria-current','env(safe-area-inset-bottom)','FINSLER_MOBILE_FLOW_API'],'mobile flow');
expect(m.display,['finslerDisplayPrefsV1','Compact trigonometry','Underscores as subscripts','Coordinate display','Numbered xᶦ / yᶦ','Result spacing','Auto-expand long results','Canonical factored output','localStorage','transformSource','FINSLER_DISPLAY_PREFS','coordinateStyle','subscriptUnderscore','compactTrig','autoExpand'],'display preferences');
if(!/createElement\('details'\)/.test(m.display)||!/createElement\('summary'\)/.test(m.display))fail('display preferences are not in an accessible disclosure');
if(!/@media\(max-width:700px\)/.test(m.display)||!/bottom:5\.4rem/.test(m.display))fail('display preference panel does not adapt to mobile workflow bar');
if(!/Recalculate to apply notation changes/.test(m.display))fail('notation preference changes do not explain how existing rendered formulas update');
if(!/MutationObserver/.test(m.results)||!/component-row/.test(m.results)||!/result-card/.test(m.results))fail('result tools are not progressive');
if(!/MutationObserver/.test(m.cancel)||!/attributeFilter:\["class"\]/.test(m.cancel))fail('cancel button does not track busy state');
if(!/catalogue-load/.test(m.share)||!/!e\.isTrusted/.test(m.share))fail('shared-state restore is not protected from startup preset replay');
if(!/expand\(x,defs\)/.test(m.share))fail('catalogue definitions are not self-contained in shared state');
if(!/item\.validation/.test(m.catalogue)||!/item\.description/.test(m.catalogue))fail('catalogue search does not include metadata');
if(!/stopImmediatePropagation/.test(m.catalogue)||!/forceCoreRenderAll/.test(m.catalogue))fail('enhanced catalogue search does not safely supersede core filtering');
if(!/@media\(max-width:760px\)/.test(m.mobile)||!/position:fixed/.test(m.mobile)||!/bottom:calc/.test(m.mobile))fail('mobile workflow bar is not mobile-only and bottom-fixed');
function expressionError(s){if(!String(s).trim())return 'empty';try{const n=math.parse(String(s));if(n.isAssignmentNode||n.isFunctionAssignmentNode||n.isBlockNode)return 'assignment';return null;}catch(e){return e.message;}}
if(expressionError('-(1-r_s/r)')||expressionError('r^2*sin(theta)^2'))fail('valid expressions rejected');if(!expressionError('1/(r-r_s')||!expressionError('r=1'))fail('invalid expression accepted');
function dependencyClosure(selected){const o={...selected},need=k=>o[k]=true;if(o.inverse)need('metric');if(o.cartan)need('metric');if(o.spray){need('metric');need('inverse');}if(o.nonlinear){need('metric');need('inverse');need('spray');}if(o.connections){need('metric');need('inverse');need('spray');need('nonlinear');}if(o.curvature){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');}if(o.deviation){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}if(o.ricci){need('metric');need('inverse');need('spray');need('nonlinear');need('connections');need('curvature');}if(o.affine){need('metric');need('inverse');need('connections');}return o;}
const ricci=dependencyClosure({ricci:true});['metric','inverse','spray','nonlinear','connections','curvature','ricci'].forEach(k=>{if(!ricci[k])fail('Ricci dependency missing '+k);});
const sample={v:1,dimension:4,coords:['t','r','theta','phi'],metric:[['-(1-r_s/r)']],outputs:{ricci:true}};const enc=Buffer.from(JSON.stringify(sample),'utf8').toString('base64url');if(JSON.stringify(JSON.parse(Buffer.from(enc,'base64url').toString('utf8')))!==JSON.stringify(sample))fail('share-state roundtrip failed');
if(!process.exitCode)console.log('PASS: enhancement checks through persistent result display preferences pass');
