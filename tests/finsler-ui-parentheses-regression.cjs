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

const match = ui.match(/  function prettyResultTex\(text\)\{[\s\S]*?\n  \}\n  function tex\(expr\)/);
if (!match) {
  fail('prettyResultTex() could not be extracted from the UI');
} else {
  const functionSource = match[0].replace(/\n  function tex\(expr\)[\s\S]*$/, '');
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
  const schwarzschild = render('rs/r');

  console.log('sin(theta) =>', singleSin);
  console.log('cos(theta) =>', singleCos);
  console.log('sin(theta)^2 =>', squareSin);
  console.log('cos(theta)^3 =>', cubeCos);
  console.log('sin(theta+phi)^2 =>', composite);
  console.log('rs/r =>', schwarzschild);

  if (/\\sin\s*\\left\(/.test(singleSin)) fail(`single-symbol sine still has parentheses: ${singleSin}`);
  if (/\\cos\s*\\left\(/.test(singleCos)) fail(`single-symbol cosine still has parentheses: ${singleCos}`);
  if (!/\\sin\^\{2\}/.test(squareSin) || /\\sin\s*\\left\(/.test(squareSin)) fail(`sine square is not written as sin^2 theta: ${squareSin}`);
  if (!/\\cos\^\{3\}/.test(cubeCos) || /\\cos\s*\\left\(/.test(cubeCos)) fail(`cosine cube is not written as cos^3 theta: ${cubeCos}`);
  if (!/\\left\(/.test(composite)) fail(`composite trig argument lost necessary parentheses: ${composite}`);
  if (!/r_\{s\}/.test(schwarzschild)) fail(`Schwarzschild radius is not displayed as r_s: ${schwarzschild}`);
  if (/(^|[^A-Za-z])rs(?=$|[^A-Za-z])/.test(schwarzschild)) fail(`bare rs remains in displayed TeX: ${schwarzschild}`);
}

if (!process.exitCode) {
  console.log('PASS: compact trig notation, trig powers, minimal grouping, and r_s display');
}
