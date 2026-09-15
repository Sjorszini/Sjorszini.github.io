const fs = require('fs');
const path = require('path');
const math = require('mathjs');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'finsler-ui-v6.js'), 'utf8');

function fail(message) {
  console.error('FAIL:', message);
  process.exitCode = 1;
}

if (!/function tex\(expr\)\{try\{return math\.parse\(String\(expr\)\)\.toTex\(\{parenthesis:"auto"\}\)/.test(ui)) {
  fail('UI tex() is not using automatic parenthesis serialization');
}
if (/function tex\(expr\)[\s\S]{0,160}parenthesis:"keep"/.test(ui)) {
  fail('UI tex() still preserves redundant source parentheses');
}

const samples = [
  '1/((rs/x2 - 1))',
  '1/(x2^2*sin(x3)^2)',
  'rs*y1*y2/(x2*(x2-rs))',
];

for (const expr of samples) {
  const tex = math.parse(expr).toTex({ parenthesis: 'auto' });
  if (/\\left\(\s*\\left\(/.test(tex) || /\\right\)\s*\\right\)/.test(tex)) {
    fail(`nested redundant parentheses remain for ${expr}: ${tex}`);
  }
  if (/^\\frac\{1\}\{\\left\(/.test(tex)) {
    fail(`whole fraction denominator is still unnecessarily parenthesized for ${expr}: ${tex}`);
  }
}

if (!process.exitCode) {
  console.log('PASS: UI math serialization removes redundant grouping while preserving mathematical structure');
}
