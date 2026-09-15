const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const math = require('mathjs');
const nerdamer = require('nerdamer-prime/all');

const root = path.resolve(__dirname, '..');
const messages = [];
let context;

function loadScript(spec) {
  const clean = String(spec).split('?')[0];
  if (/^https?:/.test(clean)) {
    if (clean.includes('mathjs') || clean.includes('nerdamer-prime')) return;
    throw new Error(`Unexpected external importScripts URL: ${spec}`);
  }
  const filename = path.resolve(root, clean);
  const code = fs.readFileSync(filename, 'utf8');
  vm.runInContext(code, context, { filename });
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

function compact(s) { return String(s).replace(/\s+/g, ''); }
function getComponent(section, label) {
  const m = messages.find(x => x.type === 'component' && x.section === section && x.label === label);
  return m && String(m.value);
}
const samples = [
  {x1:.2,x2:8,x3:1.1,x4:.4,rs:2},
  {x1:.7,x2:11,x3:.7,x4:.2,rs:3},
  {x1:.3,x2:5,x3:1.3,x4:.9,rs:1},
];
function numericEqual(a,b) {
  try {
    return samples.every(s => {
      const av=math.evaluate(a,s), bv=math.evaluate(b,s);
      const d=Number(math.abs(math.subtract(av,bv)));
      const scale=Math.max(1,Number(math.abs(av)),Number(math.abs(bv)));
      return Number.isFinite(d) && d<=1e-9*scale;
    });
  } catch(e) { return false; }
}

const payload = {
  type: 'calculate',
  n: 4,
  inputType: 'metric',
  metricEntries: [
    ['-(1-rs/x2)', '0', '0', '0'],
    ['0', '1/(1-rs/x2)', '0', '0'],
    ['0', '0', 'x2^2', '0'],
    ['0', '0', '0', 'x2^2*sin(x3)^2'],
  ],
  alphaBeta: { enabled: false },
  outputs: { inverse: true, spray: true, connections: true, affine: true },
  symbolicFunctions: [],
};

context.onmessage({ data: payload });

setImmediate(() => {
  const failures = [];
  function check(condition, message) { if (!condition) failures.push(message); }

  const error = messages.find(m => m.type === 'error');
  check(!error, `worker error: ${error && error.message}`);
  check(messages.some(m => m.type === 'done'), 'worker did not emit done');

  // Independent Schwarzschild references (verified separately with SymPy).
  const expected = {
    '\\bar R^{2}{}_{112}': 'rs*(x2-rs)/x2^4',
    '\\bar R^{2}{}_{323}': '-rs/(2*x2)',
    '\\bar R^{2}{}_{424}': '-rs*sin(x3)^2/(2*x2)',
    '\\bar R^{3}{}_{113}': '-rs*(x2-rs)/(2*x2^4)',
    '\\bar R^{3}{}_{223}': 'rs/(2*x2^2*(x2-rs))',
    '\\bar R^{3}{}_{434}': 'rs*sin(x3)^2/x2',
    '\\bar R^{4}{}_{114}': '-rs*(x2-rs)/(2*x2^4)',
    '\\bar R^{4}{}_{224}': 'rs/(2*x2^2*(x2-rs))',
    '\\bar R^{4}{}_{334}': '-rs/x2',
  };

  for (const [label, want] of Object.entries(expected)) {
    const actual = getComponent('affineCurvature', label);
    check(!!actual, `missing ${label}`);
    if (!actual) continue;
    check(numericEqual(actual, want), `${label} mathematically wrong: ${actual}`);
    check(compact(actual).length <= compact(want).length + 16, `${label} still too verbose: ${actual}`);
  }

  // Regression for the exact component reported by the user.
  const target = getComponent('affineCurvature', '\\bar R^{4}{}_{114}');
  if (target) {
    check(!/rs\s*\^\s*2\s*[-+]\s*x2\s*\*\s*rs|x2\s*\*\s*rs\s*[-+]\s*rs\s*\^\s*2/.test(target), `screenshot regression remains: ${target}`);
    check(compact(target).length <= 38, `R^phi_ttphi is not compact enough: ${target}`);
  }

  // Audit every emitted Schwarzschild affine-curvature component, not only the
  // reference sample above. Nonzero components should all be short canonical
  // expressions; this prevents another isolated unsimplified component from
  // slipping through the regression suite.
  const curvature = messages.filter(m => m.type === 'component' && m.section === 'affineCurvature');
  const nonzeroCurvature = curvature.filter(m => compact(m.value) !== '0');
  let maxCurvatureLength = 0;
  let longestCurvature = null;
  for (const m of nonzeroCurvature) {
    const len = compact(m.value).length;
    if (len > maxCurvatureLength) { maxCurvatureLength = len; longestCurvature = m; }
    check(len <= 55, `${m.label} remains non-canonical/verbose (${len} chars): ${m.value}`);
    check(!/rs\s*\^\s*2\s*[-+]\s*x2\s*\*\s*rs|x2\s*\*\s*rs\s*[-+]\s*rs\s*\^\s*2/.test(String(m.value)), `${m.label} contains the expanded Schwarzschild numerator: ${m.value}`);
  }
  check(nonzeroCurvature.length > 0, 'no nonzero Schwarzschild curvature components were emitted');

  const inverseExpected = {
    'g^{11}':'-1/(1-rs/x2)',
    'g^{22}':'1-rs/x2',
    'g^{33}':'1/x2^2',
    'g^{44}':'1/(x2^2*sin(x3)^2)'
  };
  for (const [label,want] of Object.entries(inverseExpected)) {
    const actual=getComponent('inverse',label);
    check(!!actual,`missing ${label}`);
    if(actual){
      check(numericEqual(actual,want),`${label} wrong: ${actual}`);
      check(compact(actual).length<=compact(want).length+12,`${label} verbose: ${actual}`);
    }
  }

  // Schwarzschild is vacuum. The presentation boundary must reduce every
  // affine Ricci component all the way to literal zero.
  const ricci = messages.filter(m => m.type === 'component' && m.section === 'affineRicci');
  check(ricci.length === 16, `expected 16 Ricci components, got ${ricci.length}`);
  for (const m of ricci) check(compact(m.value) === '0', `${m.label} did not simplify to zero: ${m.value}`);

  const timings = Object.fromEntries(
    messages.filter(m => m.type === 'sectionComplete').map(m => [m.section, Number(m.elapsedMs || 0)]),
  );
  const done = messages.find(m => m.type === 'done');
  check(Number(timings.spray||Infinity) < 1000, `Schwarzschild spray is still unacceptably slow: ${timings.spray} ms`);

  console.log('R^phi_ttphi:', target);
  console.log('nonzero affine-curvature components:', nonzeroCurvature.length);
  console.log('longest affine-curvature output:', longestCurvature && `${longestCurvature.label} = ${longestCurvature.value}`);
  console.log('max affine-curvature compact length:', maxCurvatureLength);
  console.log('section timings ms:', timings);
  console.log('worker total ms:', Number(done && done.totalMs || 0));

  if (failures.length) {
    console.error(`FAIL: ${failures.length} regression issue(s)`);
    failures.forEach((f, i) => console.error(`${i + 1}. ${f}`));
    process.exitCode = 1;
  } else {
    console.log('PASS: every Schwarzschild curvature output is compact; references, vacuum Ricci, inverse, and spray all pass');
  }
});
