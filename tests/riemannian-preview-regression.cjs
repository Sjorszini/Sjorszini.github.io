const puppeteer = require('puppeteer-core');
const cp = require('child_process');

function which(command) {
  try { return cp.execFileSync('bash', ['-lc', `command -v ${command}`], {encoding: 'utf8'}).trim(); }
  catch (_) { return ''; }
}

const executablePath = which('google-chrome') || which('chromium') || which('chromium-browser');
if (!executablePath) throw new Error('No Chrome/Chromium executable found.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }

(async () => {
  const browser = await puppeteer.launch({headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.setViewport({width: 1440, height: 1100, deviceScaleFactor: 1});
  await page.goto('http://127.0.0.1:8000/Finsler.html', {waitUntil: 'networkidle2', timeout: 60000});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'networkidle2', timeout: 60000});
  await page.waitForFunction(() => document.querySelector('#metricPreview')?.dataset.tex, {timeout: 10000});

  const directTex = await page.evaluate(() => ({
    product: math.parse('r*t').toTex({parenthesis: 'auto', implicit: 'hide'}),
    trig: math.parse('r*sin(theta)^2').toTex({parenthesis: 'auto', implicit: 'hide'}),
    inverseTrig: math.parse('asin(theta)').toTex({parenthesis: 'auto', implicit: 'hide'})
  }));
  assert(!directTex.product.includes('\\cdot'), `Explicit multiplication dot remains: ${directTex.product}`);
  assert(!directTex.trig.includes('\\cdot'), `Multiplication dot remains in trig expression: ${directTex.trig}`);
  assert(directTex.trig.includes('\\sin') && !/\\sin[^\n]*\\left\(/.test(directTex.trig), `sin(theta) was not compacted: ${directTex.trig}`);
  assert(directTex.inverseTrig.includes('\\arcsin') && !/\\arcsin[^\n]*\\left\(/.test(directTex.inverseTrig), `asin(theta) was not compacted: ${directTex.inverseTrig}`);
  console.log('PASS compact TeX notation');

  const initial = await page.$eval('#metricPreview', node => ({tex: node.dataset.tex, text: node.textContent, errors: node.querySelectorAll('mjx-merror').length}));
  assert(initial.tex.includes('r_{s}'), `Schwarzschild subscript missing in live preview: ${initial.tex}`);
  assert(!initial.tex.includes('\\cdot'), `Live preview contains multiplication dots: ${initial.tex}`);
  assert(initial.errors === 0, 'Initial metric preview contains a MathJax error.');

  await page.$eval('.metric-entry[data-i="2"][data-j="2"]', node => {
    node.value = 'r*t*sin(theta)';
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => {
    const tex = document.querySelector('#metricPreview')?.dataset.tex || '';
    return tex.includes('\\sin') && tex.includes('{t}');
  }, {timeout: 5000});
  const edited = await page.$eval('#metricPreview', node => node.dataset.tex);
  assert(!edited.includes('\\cdot'), `Edited live preview contains multiplication dots: ${edited}`);
  assert(!/\\sin[^\n]*\\left\(/.test(edited), `Edited live preview has unnecessary sin parentheses: ${edited}`);
  console.log('PASS live metric entry updates');

  await page.$eval('.coordinate-input[data-index="0"]', node => {
    node.value = 'tau';
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => (document.querySelector('#metricPreview')?.dataset.tex || '').includes('\\tau'), {timeout: 5000});
  console.log('PASS live coordinate updates');

  await page.$eval('.metric-entry[data-i="0"][data-j="0"]', node => {
    node.value = '(';
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => document.querySelector('#metricPreview')?.classList.contains('has-preview-error'), {timeout: 5000});
  await page.$eval('.metric-entry[data-i="0"][data-j="0"]', node => {
    node.value = '-1';
    node.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => document.querySelector('#metricPreview')?.dataset.tex && !document.querySelector('#metricPreview').classList.contains('has-preview-error'), {timeout: 5000});
  console.log('PASS preview invalid-input recovery');

  await page.select('#presetSelect', 'sphere2');
  await page.click('#loadPreset');
  await page.waitForFunction(() => document.querySelector('#dimension')?.value === '2', {timeout: 5000});
  await sleep(500);
  const spherePreview = await page.evaluate(() => ({
    tex: document.querySelector('#metricPreview')?.dataset.tex || '',
    cells: document.querySelectorAll('#metricGrid .metric-entry').length,
    hasError: document.querySelector('#metricPreview')?.classList.contains('has-preview-error')
  }));
  assert(spherePreview.cells === 4, `2-sphere editor did not resize to 2x2: ${JSON.stringify(spherePreview)}`);
  assert(!spherePreview.hasError && spherePreview.tex.includes('R') && spherePreview.tex.includes('\\sin') && !spherePreview.tex.includes('r_{s}'), `2-sphere live preview did not refresh: ${spherePreview.tex}`);
  const finalErrors = await page.$$eval('mjx-merror', nodes => nodes.map(node => node.textContent));
  assert(finalErrors.length === 0, `MathJax errors after preview interactions: ${JSON.stringify(finalErrors)}`);
  assert(browserErrors.length === 0, `Browser errors: ${JSON.stringify(browserErrors)}`);
  console.log('PASS preset-driven live preview');
  console.log('RIEMANNIAN_PREVIEW_REGRESSION_PASS');

  await browser.close();
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
