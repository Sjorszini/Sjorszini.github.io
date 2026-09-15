const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const math = require('mathjs');
const nerdamer = require('nerdamer-prime/all');

const root = path.resolve(__dirname, '..');

function makeRun(outputs) {
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

  context.onmessage({ data: {
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
    outputs,
    symbolicFunctions: [],
  }});
  return messages;
}

function compact(value) { return String(value).replace(/\s+/g, ''); }
function assertZero(value, label) {
  if (compact(value) !== '0') throw new Error(`${label} must be zero, got: ${value}`);
}
function verifyRicci(messages, expectAffineVisible) {
  const error = messages.find(m => m.type === 'error');
  if (error) throw new Error(`worker error: ${error.message}`);
  if (!messages.some(m => m.type === 'done')) throw new Error('worker did not finish');

  const affine = messages.filter(m => m.type === 'component' && m.section === 'affineRicci');
  if (expectAffineVisible) {
    if (affine.length !== 16) throw new Error(`expected 16 affine Ricci components, got ${affine.length}`);
    affine.forEach(m => assertZero(m.value, m.label));
  } else if (affine.length !== 0) {
    throw new Error('internally forced affine Ricci output leaked into the UI message stream');
  }

  const ric = messages.find(m => m.type === 'component' && m.section === 'ricci' && m.label === '\\mathrm{Ric}');
  if (!ric) throw new Error('missing Finsler Ricci scalar');
  assertZero(ric.value, 'Finsler Ricci scalar');

  const tensor = messages.filter(m => m.type === 'component' && m.section === 'ricci' && /^R_\{/.test(m.label));
  if (tensor.length !== 10) throw new Error(`expected 10 independent Finsler Ricci tensor components, got ${tensor.length}`);
  tensor.forEach(m => assertZero(m.value, m.label));
}

const visible = makeRun({ affine: true, ricci: true });
verifyRicci(visible, true);

const ricciOnly = makeRun({ ricci: true });
verifyRicci(ricciOnly, false);

console.log('PASS: affine Ricci = 0 forces Ric = 0 and R_ij = 0, with or without affine output selected');
