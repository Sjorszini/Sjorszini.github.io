const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { performance } = require('perf_hooks');
const math = require('mathjs');

const root = path.resolve(__dirname, '..');
const messages = [];
let context;

function loadScript(spec) {
  const clean = String(spec).split('?')[0];
  if (/^https?:/.test(clean)) {
    // finsler-worker-v3.js imports the browser math.js bundle.  The VM already
    // exposes the exact same npm version as global `math`, so no second load is
    // required here.
    if (clean.includes('mathjs')) return;
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
function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectStrings(v, out));
  return out;
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
  const error = messages.find(m => m.type === 'error');
  if (error) throw new Error(error.message || 'worker error');
  assert(messages.some(m => m.type === 'done'), 'worker did not emit done');

  // Exact regression for the component in the user screenshot:
  // R^phi_{t t phi} = -rs (r-rs) / (2 r^4).
  const target = getComponent('affineCurvature', '\\bar R^{4}{}_{114}');
  assert(target, 'missing Schwarzschild R^4_114 component');
  assert(
    math.symbolicEqual(target, '-rs*(x2-rs)/(2*x2^4)'),
    `R^4_114 is mathematically wrong: ${target}`,
  );
  assert(
    !context.finslerV6HasFactorableSum(target),
    `R^4_114 still contains an extractable common factor: ${target}`,
  );
  assert(
    !/rs\s*\^\s*2\s*[-+]\s*x2\s*\*\s*rs|x2\s*\*\s*rs\s*[-+]\s*rs\s*\^\s*2/.test(target),
    `R^4_114 regressed to the expanded numerator from the screenshot: ${target}`,
  );

  // Independent Schwarzschild reference components.
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
    assert(actual, `missing ${label}`);
    assert(math.symbolicEqual(actual, want), `${label}: ${actual} != ${want}`);
    assert(!context.finslerV6HasFactorableSum(actual), `${label} still factorable: ${actual}`);
  }

  // The worker boundary must be a fixed point: emitted expressions are already
  // in the canonical form that PS would choose, and no emitted Schwarzschild
  // component/summary may contain a nontrivially factorable additive subtree.
  const outgoing = [];
  for (const m of messages) {
    if (m.type === 'component') outgoing.push(String(m.value));
    if (m.type === 'sectionComplete' && m.summary) collectStrings(m.summary, outgoing);
  }
  for (const value of outgoing) {
    const again = String(context.PS(value));
    assert.strictEqual(compact(again), compact(value), `output is not a PS fixed point: ${value} -> ${again}`);
    assert(!context.finslerV6HasFactorableSum(value), `emitted expression still has a common additive factor: ${value}`);
  }

  // Schwarzschild is vacuum; all emitted affine Ricci components must be zero.
  const ricci = messages.filter(m => m.type === 'component' && m.section === 'affineRicci');
  assert.strictEqual(ricci.length, 16, `expected 16 Ricci components, got ${ricci.length}`);
  for (const m of ricci) assert.strictEqual(compact(m.value), '0', `${m.label} = ${m.value}`);

  const timings = Object.fromEntries(
    messages.filter(m => m.type === 'sectionComplete').map(m => [m.section, Number(m.elapsedMs || 0)]),
  );
  const done = messages.find(m => m.type === 'done');
  console.log('PASS: Schwarzschild worker outputs are factored canonical forms');
  console.log('R^phi_ttphi:', target);
  console.log('section timings ms:', timings);
  console.log('worker total ms:', Number(done.totalMs || 0));
});
