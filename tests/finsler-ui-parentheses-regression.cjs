const fs = require('fs');
const path = require('path');
const vm = require('vm');
const math = require('mathjs');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'finsler-ui-v6.js'), 'utf8');

function fail(message) {
  console.error('FAIL:', message);
  process.exitCode = 1;
}

if (!/toTex\(\{parenthesis:"auto"\}\)/.test(ui)) fail('UI tex() is not using automatic parenthesis serialization');
if (/function tex\(expr\)[\s\S]{0,240}parenthesis:"keep"/.test(ui)) fail('UI tex() still preserves redundant source parentheses');

const start = ui.indexOf('function prettyResultTex(text)');
const end = ui.indexOf('function tex(expr)', start);
if (start < 0 || end <= start) {
  fail('prettyResultTex() could not be extracted from the UI');
} else {
  const functionSource = ui.slice(start, end);
  const context = {};
  vm.runInNewContext(functionSource + '\nthis.prettyResultTex=prettyResultTex;', context);
  const pretty = context.prettyResultTex;
  const render = expr => pretty(math.parse(expr).toTex({ parenthesis: 'auto' }));

  const structuralSamples = [
    '1/((rs/x2 - 1))',
    '1/(x2^2*sin(x3)^2)',
    'rs*y1*y2/(x2*(x2-rs))',
  ];
  for (const expr of structuralSamples) {
    const out = render(expr);
    if (/\\left\(\s*\\left\(/.test(out) || /\\right\)\s*\\right\)/.test(out)) {
      fail(`nested redundant parentheses remain for ${expr}: ${out}`);
    }
  }

  const singleSin = render('sin(theta)');
  const singleCos = render('cos(theta)');
  const squareSin = render('sin(theta)^2');
  const cubeCos = render('cos(theta)^3');
  const composite = render('sin(theta+phi)^2');
  const bareRs = render('rs/r');
  const subscriptRs = render('r_s/r');

  console.log('sin(theta) =>', singleSin);
  console.log('cos(theta) =>', singleCos);
  console.log('sin(theta)^2 =>', squareSin);
  console.log('cos(theta)^3 =>', cubeCos);
  console.log('sin(theta+phi)^2 =>', composite);
  console.log('rs/r =>', bareRs);
  console.log('r_s/r =>', subscriptRs);

  if (/\\sin\s*\\left\(/.test(singleSin)) fail(`single-symbol sine still has parentheses: ${singleSin}`);
  if (/\\cos\s*\\left\(/.test(singleCos)) fail(`single-symbol cosine still has parentheses: ${singleCos}`);
  if (!/\\sin\^\{2\}/.test(squareSin) || /\\sin\s*\\left\(/.test(squareSin)) fail(`sine square is not written as sin^2 theta: ${squareSin}`);
  if (!/\\cos\^\{3\}/.test(cubeCos) || /\\cos\s*\\left\(/.test(cubeCos)) fail(`cosine cube is not written as cos^3 theta: ${cubeCos}`);
  if (!/\\left\(/.test(composite)) fail(`composite trig argument lost necessary parentheses: ${composite}`);
  if (!/(^|[^A-Za-z])rs(?=$|[^A-Za-z])/.test(bareRs)) fail(`bare rs is not preserved as rs: ${bareRs}`);
  if (/\\_/.test(subscriptRs)) fail(`entered r_s is being rendered as a literal underscore instead of a subscript: ${subscriptRs}`);
  if (!/r_(?:\{s\}|s)/.test(subscriptRs)) fail(`entered r_s is not rendered as a true subscript: ${subscriptRs}`);
  if (bareRs === subscriptRs) fail(`rs and r_s rendered identically: ${bareRs}`);
}

if (!process.exitCode) {
  console.log('PASS: compact trig notation, minimal grouping, and symbol-preserving rs/r_s display');
}
