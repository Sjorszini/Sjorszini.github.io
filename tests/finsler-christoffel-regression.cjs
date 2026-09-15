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
  const code = fs.readFileSync(path.resolve(root, clean), 'utf8');
  vm.runInContext(code, context, { filename: clean });
}

context = vm.createContext({
  console, performance, math, nerdamer, setTimeout, clearTimeout,
  postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); },
});
context.self = context;
context.globalThis = context;
context.importScripts = (...specs) => specs.forEach(loadScript);
loadScript('finsler-worker-v4.js');

function compact(s) { return String(s).replace(/\s+/g, ''); }
function component(section, label) {
  const m = messages.find(x => x.type === 'component' && x.section === section && x.label === label);
  return m && String(m.value);
}

const samples = [
  { x1: .2, x2: 8, x3: 1.1, x4: .4, rs: 2 },
  { x1: .7, x2: 11, x3: .7, x4: .2, rs: 3 },
  { x1: 1.3, x2: 5, x3: 1.3, x4: .9, rs: 1 },
];
function numericEqual(a, b) {
  try {
    return samples.every(scope => {
      const av = math.evaluate(a, scope), bv = math.evaluate(b, scope);
      const d = Number(math.abs(math.subtract(av, bv)));
      const scale = Math.max(1, Number(math.abs(av)), Number(math.abs(bv)));
      return Number.isFinite(d) && d <= 1e-9 * scale;
    });
  } catch (_) { return false; }
}

/* This is the exact algebraic shape that repeatedly escaped into the UI.  It
   must already be factored by S(), because S() is the expression reused by
   spray/curvature calculations. */
const direct = String(context.S('(x2*rs-rs^2)/(2*x2^3)'));
if (!numericEqual(direct, 'rs*(x2-rs)/(2*x2^3)')) {
  throw new Error(`computational S() changed the value: ${direct}`);
}
if (/x2\*?rs-rs\^2|rs\*?x2-rs\^2/.test(compact(direct))) {
  throw new Error(`computational S() left Gamma^r_tt expanded: ${direct}`);
}
if (!compact(direct).includes('rs') || !compact(direct).includes('x2-rs')) {
  throw new Error(`computational S() did not preserve the factored canonical form: ${direct}`);
}

context.onmessage({ data: {
  type: 'calculate', n: 4, inputType: 'metric',
  metricEntries: [
    ['-(1-rs/x2)', '0', '0', '0'],
    ['0', '1/(1-rs/x2)', '0', '0'],
    ['0', '0', 'x2^2', '0'],
    ['0', '0', '0', 'x2^2*sin(x3)^2'],
  ],
  alphaBeta: { enabled: false },
  outputs: { inverse: true, spray: true, connections: true, affine: true },
  symbolicFunctions: [],
}});

setImmediate(() => {
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const expected = {
    '\\Gamma^{1}{}_{12}': 'rs/(2*x2*(x2-rs))',
    '\\Gamma^{2}{}_{11}': 'rs*(x2-rs)/(2*x2^3)',
    '\\Gamma^{2}{}_{22}': '-rs/(2*x2*(x2-rs))',
    '\\Gamma^{2}{}_{33}': '-(x2-rs)',
    '\\Gamma^{2}{}_{44}': '-(x2-rs)*sin(x3)^2',
    '\\Gamma^{3}{}_{23}': '1/x2',
    '\\Gamma^{3}{}_{44}': '-sin(x3)*cos(x3)',
    '\\Gamma^{4}{}_{24}': '1/x2',
    '\\Gamma^{4}{}_{34}': 'cos(x3)/sin(x3)',
  };

  for (const [label, want] of Object.entries(expected)) {
    const actual = component('christoffel', label);
    check(!!actual, `missing ${label}`);
    if (!actual) continue;
    check(numericEqual(actual, want), `${label} wrong: ${actual}`);
    check(compact(actual).length <= compact(want).length + 10, `${label} still verbose: ${actual}`);
  }

  const target = component('christoffel', '\\Gamma^{2}{}_{11}');
  if (target) {
    check(!/x2\s*\*\s*rs\s*-\s*rs\s*\^\s*2|rs\s*\*\s*x2\s*-\s*rs\s*\^\s*2/.test(target),
      `screenshot regression remains: ${target}`);
    check(compact(target).includes('x2-rs'), `Gamma^r_tt is not factored: ${target}`);
  }

  /* Existing curvature regression checks independent SymPy values. Here we also
     require that the calculation completes after consuming the canonical
     Christoffels downstream. */
  check(messages.some(m => m.type === 'sectionComplete' && m.section === 'spray'), 'spray did not complete');
  check(messages.some(m => m.type === 'sectionComplete' && m.section === 'affineCurvature'), 'affine curvature did not complete');
  check(messages.some(m => m.type === 'done'), 'worker did not emit done');

  console.log('computational S target:', direct);
  console.log('emitted Gamma^r_tt:', target);
  if (failures.length) {
    console.error(`FAIL: ${failures.length} Christoffel regression issue(s)`);
    failures.forEach((f, i) => console.error(`${i + 1}. ${f}`));
    process.exitCode = 1;
  } else {
    console.log('PASS: Schwarzschild Christoffels are canonical before downstream use and at output');
  }
});
