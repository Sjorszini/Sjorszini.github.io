const puppeteer = require('puppeteer-core');
const cp = require('child_process');

function which(command) {
  try {
    return cp.execFileSync('bash', ['-lc', `command -v ${command}`], {encoding: 'utf8'}).trim();
  } catch (_) {
    return '';
  }
}

const executablePath = which('google-chrome') || which('chromium') || which('chromium-browser');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const compact = value => String(value).replace(/\s+/g, '');
const isZero = value => compact(value) === '0';
const nearly = (a, b, eps = 1e-8) => Number.isFinite(a) && Math.abs(a - b) < eps;

if (!executablePath) throw new Error('No Chrome/Chromium executable found.');

let browser;
let page;
const browserErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setOutputs(keys) {
  await page.evaluate(keys => {
    for (const input of document.querySelectorAll('[data-output]')) input.checked = false;
    for (const key of keys) {
      const input = document.querySelector(`[data-output="${key}"]`);
      if (!input) throw new Error(`Unknown output ${key}`);
      input.checked = true;
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }, keys);
}

async function waitForSettled(timeout = 45000) {
  await page.waitForFunction(() => {
    const status = document.querySelector('#status');
    return status && (status.classList.contains('is-success') || status.classList.contains('is-error'));
  }, {timeout});
  return page.$eval('#status', node => ({text: node.textContent, className: node.className}));
}

async function calculate(keys, timeout = 45000) {
  await setOutputs(keys);
  await page.evaluate(() => { window.__riemannianLastResult = null; });
  await page.click('#calculateSelected');
  const status = await waitForSettled(timeout);
  assert(status.className.includes('is-success'), `Calculation failed: ${status.text}`);
  await page.waitForFunction(() => window.__riemannianLastResult !== null, {timeout: 3000});
  await sleep(250);
  return page.evaluate(() => window.__riemannianLastResult);
}

async function loadPreset(id) {
  await page.select('#presetSelect', id);
  await page.click('#loadPreset');
  await sleep(40);
}

async function setCustomMetric({n, coords, matrix, constants = '', functions = ''}) {
  await page.select('#dimension', String(n));
  await page.$eval('#dimension', node => node.dispatchEvent(new Event('change', {bubbles: true})));
  await page.$$eval('.coordinate-input', (nodes, names) => {
    nodes.forEach((node, index) => {
      node.value = names[index];
      node.dispatchEvent(new Event('change', {bubbles: true}));
    });
  }, coords);
  await page.$eval('#constantsInput', (node, value) => {
    node.value = value;
    node.dispatchEvent(new Event('change', {bubbles: true}));
  }, constants);
  await page.$eval('#functionsInput', (node, value) => {
    node.value = value;
    node.dispatchEvent(new Event('change', {bubbles: true}));
  }, functions);
  await page.evaluate(matrix => {
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        const input = document.querySelector(`.metric-entry[data-i="${i}"][data-j="${j}"]`);
        if (!input) throw new Error(`Missing metric entry ${i},${j}`);
        input.value = matrix[i][j];
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    }
    const first = document.querySelector('.metric-entry');
    if (first) first.dispatchEvent(new Event('change', {bubbles: true}));
  }, matrix);
}

async function evaluateExpression(expr, scope) {
  return page.evaluate(({expr, scope}) => math.evaluate(expr, scope), {expr, scope});
}

function allZero(matrix) {
  return Array.isArray(matrix) && matrix.every(row => row.every(isZero));
}

function component(components, i, j, k, l) {
  return components.find(c => c.i === i && c.j === j && c.k === k && (l === undefined || c.l === l));
}

async function copyTexForCard(title) {
  return page.evaluate(title => {
    const card = Array.from(document.querySelectorAll('#results details')).find(node =>
      node.querySelector('summary strong')?.textContent === title
    );
    return card?.querySelector('.copy-button')?.dataset.copy || '';
  }, title);
}

async function assertNoMathErrors(label) {
  const mathErrors = await page.$$eval('mjx-merror', nodes => nodes.map(node => node.textContent));
  assert(mathErrors.length === 0, `${label}: MathJax errors: ${JSON.stringify(mathErrors)}`);
  assert(browserErrors.length === 0, `${label}: browser errors: ${JSON.stringify(browserErrors)}`);
}

(async () => {
  browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  page = await browser.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.setViewport({width: 1440, height: 1100, deviceScaleFactor: 1});
  await page.goto('http://127.0.0.1:8000/Finsler.html', {waitUntil: 'networkidle2', timeout: 60000});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'networkidle2', timeout: 60000});

  // 1. Schwarzschild: fast vacuum curvature and clean presentation.
  await loadPreset('schwarzschild');
  const schwarzschild = await calculate(['inverse', 'christoffel', 'ricci', 'scalar', 'einstein']);
  assert(allZero(schwarzschild.ricci), 'Schwarzschild Ricci tensor is not zero.');
  assert(isZero(schwarzschild.scalar), 'Schwarzschild Ricci scalar is not zero.');
  assert(allZero(schwarzschild.einstein), 'Schwarzschild Einstein tensor is not zero.');
  assert(compact(schwarzschild.inverse.det).includes('x2') && !schwarzschild.inverse.det.includes('r_s -'), 'Schwarzschild determinant presentation regressed.');
  const schwarzschildText = await page.$eval('#results', node => node.textContent);
  assert(!schwarzschildText.includes('__uf'), 'Internal function tokens leaked into Schwarzschild UI.');
  await assertNoMathErrors('Schwarzschild');
  console.log('PASS Schwarzschild vacuum');

  // 2. Full Riemann output: round 2-sphere, including one signed component.
  await loadPreset('sphere2');
  const sphere = await calculate(['riemann', 'ricci', 'scalar', 'einstein']);
  const sphereRiemann = component(sphere.riemann, 0, 1, 0, 1);
  assert(sphereRiemann, 'Expected R^theta_{phi theta phi} component was not returned.');
  const theta = 0.73;
  const sphereValue = await evaluateExpression(sphereRiemann.value, {x1: theta, x2: 0.2, R: 2});
  assert(nearly(sphereValue, Math.sin(theta) ** 2), `2-sphere Riemann component wrong: ${sphereRiemann.value}`);
  assert(nearly(await evaluateExpression(sphere.scalar, {x1: theta, x2: 0.2, R: 2}), 0.5), `2-sphere scalar wrong: ${sphere.scalar}`);
  assert(allZero(sphere.einstein), '2D Einstein tensor should vanish identically.');
  assert((sphere.riemann || []).length > 0, 'Full Riemann output unexpectedly empty.');
  await assertNoMathErrors('2-sphere Riemann');
  console.log('PASS full Riemann output');

  // 3. Geodesic equations: flat plane in polar coordinates.
  await loadPreset('polar2');
  const polar = await calculate(['christoffel', 'geodesic', 'ricci', 'scalar']);
  assert(allZero(polar.ricci) && isZero(polar.scalar), 'Polar plane should be flat.');
  const radialGeo = polar.geodesic.find(c => c.i === 0);
  const angularGeo = polar.geodesic.find(c => c.i === 1);
  assert(radialGeo && angularGeo, 'Polar geodesic equations are incomplete.');
  const geoScope = {x1: 2, x2: 0.4, v1: 0.3, v2: 0.4};
  assert(nearly(await evaluateExpression(radialGeo.value, geoScope), -0.32), `Radial geodesic term wrong: ${radialGeo.value}`);
  assert(nearly(await evaluateExpression(angularGeo.value, geoScope), 0.12), `Angular geodesic term wrong: ${angularGeo.value}`);
  await assertNoMathErrors('polar geodesics');
  console.log('PASS geodesic equations');

  // 4. Custom 2D metric: ds^2 = dx^2 + exp(2x) dy^2 has R = -2.
  await setCustomMetric({
    n: 2,
    coords: ['x', 'y'],
    matrix: [['1', '0'], ['0', 'exp(2*x)']]
  });
  const custom2 = await calculate(['ricci', 'scalar', 'einstein']);
  const custom2Scope = {x1: 0.31, x2: 0.4};
  assert(nearly(await evaluateExpression(custom2.scalar, custom2Scope), -2), `Custom 2D scalar wrong: ${custom2.scalar}`);
  assert(nearly(await evaluateExpression(custom2.ricci[0][0], custom2Scope), -1), `Custom 2D R_xx wrong: ${custom2.ricci[0][0]}`);
  assert(nearly(await evaluateExpression(custom2.ricci[1][1], custom2Scope), -Math.exp(0.62)), `Custom 2D R_yy wrong: ${custom2.ricci[1][1]}`);
  assert(allZero(custom2.einstein), 'Custom 2D Einstein tensor should vanish.');
  await assertNoMathErrors('custom 2D metric');
  console.log('PASS custom 2D metric');

  // 5. Custom 3D metric: cylindrical Euclidean space is flat with nonzero connection.
  await setCustomMetric({
    n: 3,
    coords: ['r', 'phi', 'z'],
    matrix: [['1', '0', '0'], ['0', 'r^2', '0'], ['0', '0', '1']]
  });
  const custom3 = await calculate(['christoffel', 'ricci', 'scalar']);
  assert(allZero(custom3.ricci) && isZero(custom3.scalar), 'Custom 3D cylindrical metric should be flat.');
  const gammaRpp = component(custom3.christoffel, 0, 1, 1);
  const gammaPrp = component(custom3.christoffel, 1, 0, 1);
  assert(gammaRpp && gammaPrp, 'Expected cylindrical Christoffel symbols missing.');
  assert(nearly(await evaluateExpression(gammaRpp.value, {x1: 2, x2: 0.2, x3: 0.3}), -2), `Gamma^r_phiphi wrong: ${gammaRpp.value}`);
  assert(nearly(await evaluateExpression(gammaPrp.value, {x1: 2, x2: 0.2, x3: 0.3}), 0.5), `Gamma^phi_rphi wrong: ${gammaPrp.value}`);
  await assertNoMathErrors('custom 3D metric');
  console.log('PASS custom 3D metric');

  // 6. Single-variable symbolic function away from t: compact partial notation and correct curvature.
  await setCustomMetric({
    n: 2,
    coords: ['x', 'y'],
    functions: 'f(x)',
    matrix: [['1', '0'], ['0', 'f(x)^2']]
  });
  const functionMetric = await calculate(['ricci', 'scalar']);
  const fScope = {x1: 0.2, x2: 0.4, __uf0: 2, __uf0_d1: 3, __uf0_d1_1: 5};
  assert(nearly(await evaluateExpression(functionMetric.scalar, fScope), -5), `f(x) warped scalar wrong: ${functionMetric.scalar}`);
  const functionScalarTex = await copyTexForCard('Ricci scalar');
  assert(functionScalarTex.includes('\\partial_{x}^{2}') && functionScalarTex.includes('f'), `f(x) second derivative TeX is not compact partial notation: ${functionScalarTex}`);
  assert(!functionScalarTex.includes('__uf'), `Internal function token leaked into TeX: ${functionScalarTex}`);
  await assertNoMathErrors('single-variable function');
  console.log('PASS symbolic f(x) derivatives');

  // 7. Flat and curved FLRW: time derivatives, exact numerical identities, no radial debris.
  await loadPreset('flrw-flat');
  const flatFlrw = await calculate(['ricci', 'scalar', 'einstein']);
  const flatScope = {x1: 0, x2: 0.7, x3: 0.8, x4: 0.2, __uf0: 2, __uf0_d1: 3, __uf0_d1_1: 5};
  assert(nearly(await evaluateExpression(flatFlrw.scalar, flatScope), 28.5), `Flat FLRW scalar wrong: ${flatFlrw.scalar}`);
  assert(nearly(await evaluateExpression(flatFlrw.einstein[0][0], flatScope), 6.75), `Flat FLRW G_tt wrong: ${flatFlrw.einstein[0][0]}`);
  const flatRicciTex = await copyTexForCard('Ricci tensor');
  assert(flatRicciTex.includes('\\dot{a}') && flatRicciTex.includes('\\ddot{a}'), `FLRW dot notation regressed: ${flatRicciTex}`);

  await loadPreset('flrw-curved');
  const curvedFlrw = await calculate(['ricci', 'scalar', 'einstein']);
  const curvedScope = {...flatScope, k: 0.1};
  const expectedCurvedScalar = 6 * (curvedScope.k + curvedScope.__uf0 * curvedScope.__uf0_d1_1 + curvedScope.__uf0_d1 ** 2) / curvedScope.__uf0 ** 2;
  assert(nearly(await evaluateExpression(curvedFlrw.scalar, curvedScope), expectedCurvedScalar), `Curved FLRW scalar wrong: ${curvedFlrw.scalar}`);
  assert(!/x2/.test(curvedFlrw.scalar), `Curved FLRW scalar retained cancelled radial factors: ${curvedFlrw.scalar}`);
  await assertNoMathErrors('FLRW');
  console.log('PASS FLRW');

  // 8. Multivariable user function: pp-wave transverse Laplacian and partial notation.
  await loadPreset('ppwave');
  const pp = await calculate(['ricci', 'scalar', 'einstein']);
  const ppScope = {x1: 0.2, x2: 0.1, x3: 0.3, x4: 0.4, __uf0: 7, __uf0_d2_2: 4, __uf0_d3_3: 6};
  assert(isZero(pp.scalar), `pp-wave scalar should vanish: ${pp.scalar}`);
  assert(nearly(await evaluateExpression(pp.ricci[0][0], ppScope), -5), `pp-wave R_uu wrong: ${pp.ricci[0][0]}`);
  assert(nearly(await evaluateExpression(pp.einstein[0][0], ppScope), -5), `pp-wave G_uu wrong: ${pp.einstein[0][0]}`);
  const ppTex = await copyTexForCard('Ricci tensor');
  assert(ppTex.includes('\\partial_{x}^{2}') && ppTex.includes('\\partial_{y}^{2}') && ppTex.includes('H'), `pp-wave partial TeX regressed: ${ppTex}`);
  await assertNoMathErrors('pp-wave');
  console.log('PASS multivariable function');

  // 9. Input validation: syntax errors and undeclared symbols must fail before worker execution.
  await loadPreset('minkowski');
  await setOutputs(['scalar']);
  await page.$eval('.metric-entry[data-i="0"][data-j="0"]', node => { node.value = 'sin('; });
  await page.click('#calculateSelected');
  let status = await waitForSettled(3000);
  assert(status.className.includes('is-error'), `Malformed expression did not produce an error: ${status.text}`);
  assert(await page.$eval('#calculationTime', node => node.hidden), 'Timer should stay hidden when parsing fails before worker start.');

  await loadPreset('minkowski');
  await setOutputs(['scalar']);
  await page.$eval('.metric-entry[data-i="1"][data-j="1"]', node => { node.value = '1+q'; });
  await page.click('#calculateSelected');
  status = await waitForSettled(3000);
  assert(status.className.includes('is-error') && status.text.includes('Undeclared symbol'), `Undeclared symbol validation failed: ${status.text}`);
  console.log('PASS input validation');

  // 10. Cancellation: starting and immediately cancelling an expensive job must leave a clean idle UI.
  await loadPreset('schwarzschild');
  await setOutputs(['riemann', 'ricci', 'scalar', 'einstein']);
  await page.evaluate(() => {
    document.querySelector('#calculateSelected').click();
    document.querySelector('#cancelCalculation').click();
  });
  await sleep(400);
  const cancelState = await page.evaluate(() => ({
    text: document.querySelector('#status').textContent,
    timingHidden: document.querySelector('#calculationTime').hidden,
    cancelHidden: document.querySelector('#cancelCalculation').hidden,
    calculateDisabled: document.querySelector('#calculateSelected').disabled
  }));
  assert(cancelState.text.includes('cancelled'), `Cancellation status regressed: ${JSON.stringify(cancelState)}`);
  assert(cancelState.timingHidden && cancelState.cancelHidden && !cancelState.calculateDisabled, `Cancellation did not restore idle UI: ${JSON.stringify(cancelState)}`);
  console.log('PASS cancellation');

  await assertNoMathErrors('final');
  console.log('RIEMANNIAN_BROWSER_REGRESSION_PASS');
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  try {
    if (page) await page.screenshot({path: 'riemannian-regression-failure.png', fullPage: true});
  } catch (_) {}
  try { if (browser) await browser.close(); } catch (_) {}
  process.exit(1);
});
