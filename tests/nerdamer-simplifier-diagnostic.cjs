const nerdamer = require('nerdamer-prime/all.min');

const expressions = [
  '((rs^2-rs^3/x2)/x2^4+(rs/x2-(1/x2)^2*rs^2)*(rs^2-x2*rs)/(x2^3*rs-x2^4))/4/(1-rs/x2)+(x2*rs-rs^2)*3/2/x2^4+rs*(-1)/2/x2^3',
  '(rs-rs^2/x2)/2/(1-rs/x2)/x2+(x2-rs)*(x2^2*rs-x2^3)/(x2^3*rs-x2^4)-1',
  'sin(x3)^2*((rs-rs^2/x2)/2/(1-rs/x2)/x2+(x2-rs)*(x2^2*rs-x2^3)/(x2^3*rs-x2^4)-1)',
  '(rs^2-x2*rs)*(x2^2*rs-x2^3)/2/x2^3/(x2^3*rs-x2^4)',
  '(2*rs*x2+(rs^2-x2*rs)/2/(1-rs/x2)+(x2^3-x2^2*rs)*(3*rs*x2^2-4*x2^3)/(x2^3*rs-x2^4)-3*x2^2)/(x2^3*rs-x2^4)+(1/(x2^3*rs-x2^4))^2*(x2^2*rs-x2^3)^2',
  'sin(x3)^2*((x2^2*rs-x2^3)*(rs-x2)/(x2^3*rs-x2^4)+1)',
  '(x2-rs)*(x2^2*rs-x2^3)/(x2^3*rs-x2^4)-1',
  '(rs^2-x2*rs)/(2*x2^4)'
];
const expected = [
  'rs*(x2-rs)/x2^4',
  '-rs/(2*x2)',
  '-rs*sin(x3)^2/(2*x2)',
  '-rs*(x2-rs)/(2*x2^4)',
  'rs/(2*x2^2*(x2-rs))',
  'rs*sin(x3)^2/x2',
  '-rs/x2',
  '-rs*(x2-rs)/(2*x2^4)'
];

function simplify(expr) {
  const direct = nerdamer(`simplify(${expr})`).toString();
  let factored = direct;
  try { factored = nerdamer(`factor(${direct})`).toString(); } catch (_) {}
  return {direct, factored};
}

let fail = 0;
expressions.forEach((expr, i) => {
  const out = simplify(expr);
  const diff = nerdamer(`simplify((${out.factored})-(${expected[i]}))`).toString();
  const ok = diff === '0';
  if (!ok) fail++;
  console.log(`CASE ${i+1}`);
  console.log(' input   :', expr);
  console.log(' simplify:', out.direct);
  console.log(' factor  :', out.factored);
  console.log(' expected:', expected[i]);
  console.log(' diff    :', diff, 'OK=', ok);
});
if (fail) process.exitCode = 1;
