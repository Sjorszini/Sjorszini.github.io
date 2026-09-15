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
  const failures = [];
  function check(condition, message) { if (!condition) failures.push(message); }

  const error = messages.find(m => m.type === 'error');
  check(!error, `worker error: ${error && error.message}`);
  check(messages.some(m => m.type === 'done'), 'worker did not emit done');

  const target = getComponent('affineCurvature', '\\bar R^{4}{}_{114}');
  check(!!target, 'missing Schwarzschild R^4_114 component');
  if (target) {
    check(math.symbolicEqual(target, '-rs*(x2-rs)/(2*x2^4)'), `R^4_114 mathematically wrong: ${target}`);
    check(!context.finslerV7HasFactorableSum(target), `R^4_114 still contains an extractable common factor: ${target}`);
    check(!/rs\s*\^\s*2\s*[-+]\s*x2\s*\*\s*rs|x2\s*\*\s*rs\s*[-+]\s*rs\s*\^\s*2/.test(target), `R^4_114 regressed to expanded numerator: ${target}`);
  }

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
    check(math.symbolicEqual(actual, want), `${label}: ${actual} != ${want}`);
    check(!context.finslerV7HasFactorableSum(actual), `${label} still has an extractable additive factor: ${actual}`);
  }

  const outgoing = [];
  for (const m of messages) {
    if (m.type === 'component') outgoing.push({where: `${m.section}:${m.label}`, value: String(m.value)});
    if (m.type === 'sectionComplete' && m.summary) {
      for (const value of collectStrings(m.summary)) outgoing.push({where: `${m.section}:summary`, value});
    }
  }
  for (const item of outgoing) {
    const again = String(context.PS(item.value));
    check(compact(again) === compact(item.value), `${item.where} not a PS fixed point: ${item.value} -> ${again}`);
    check(!context.finslerV7HasFactorableSum(item.value), `${item.where} still has a common additive factor: ${item.value}`);
  }

  const ricci = messages.filter(m => m.type === 'component' && m.section === 'affineRicci');
  check(ricci.length === 16, `expected 16 Ricci components, got ${ricci.length}`);
  for (const m of ricci) check(compact(m.value) === '0', `${m.label} = ${m.value}`);

  const timings = Object.fromEntries(
    messages.filter(m => m.type === 'sectionComplete').map(m => [m.section, Number(m.elapsedMs || 0)]),
  );
  const done = messages.find(m => m.type === 'done');

  console.log('R^phi_ttphi:', target);
  console.log('selected Schwarzschild curvature components:');
  for (const label of Object.keys(expected)) console.log(`  ${label} = ${getComponent('affineCurvature', label)}`);
  console.log('section timings ms:', timings);
  console.log('worker total ms:', Number(done && done.totalMs || 0));

  if (failures.length) {
    console.error(`FAIL: ${failures.length} regression issue(s)`);
    failures.forEach((f, i) => console.error(`${i + 1}. ${f}`));
    process.exitCode = 1;
  } else {
    console.log('PASS: all Schwarzschild worker outputs are canonical and fully reduced under the regression rules');
  }
});
