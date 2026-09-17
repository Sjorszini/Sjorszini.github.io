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

  assert(await page.$('button#detectNotation') === null, 'Detect notation button is still visible in the DOM as a button.');
  assert(await page.$eval('#detectNotation', node => node.hidden), 'Compatibility placeholder for removed notation button should remain hidden.');

  const expected = [
    ['spherical-general', 'A(r), B(r)', ''],
    ['reissner-nordstrom', '', 'M, Q'],
    ['desitter-static', '', 'Lambda'],
    ['kerr-bl', '', 'M, a'],
    ['bianchi-i', 'a(t), b(t), c(t)', ''],
    ['kasner', '', 'p_1, p_2, p_3']
  ];
  const optionValues = await page.$$eval('#presetSelect option', nodes => nodes.map(n => n.value));
  for (const [id] of expected) assert(optionValues.includes(id), `Missing preset option ${id}`);

  async function loadPreset(id, functions, constants) {
    await page.select('#presetSelect', id);
    await page.click('#loadPreset');
    await page.waitForFunction(id => document.querySelector('#presetSelect')?.value === id, {}, id);
    await page.waitForFunction(() => document.querySelector('#metricPreview')?.dataset.tex && !document.querySelector('#metricPreview')?.classList.contains('has-preview-error'), {timeout: 10000});
    await sleep(250);
    const state = await page.evaluate(() => ({
      dim: document.querySelector('#dimension')?.value,
      functions: document.querySelector('#functionsInput')?.value,
      constants: document.querySelector('#constantsInput')?.value,
      coords: Array.from(document.querySelectorAll('.coordinate-input')).map(n => n.value),
      cells: Array.from(document.querySelectorAll('.metric-entry')).map(n => n.value),
      preview: document.querySelector('#metricPreview')?.dataset.tex || '',
      note: document.querySelector('#presetNote')?.textContent || '',
      status: document.querySelector('#status')?.textContent || ''
    }));
    assert(state.dim === '4', `${id}: expected dimension 4, got ${state.dim}`);
    assert(state.functions === functions, `${id}: wrong functions declaration: ${state.functions}`);
    assert(state.constants === constants, `${id}: wrong constants declaration: ${state.constants}`);
    assert(state.cells.length === 16, `${id}: expected 4x4 metric editor`);
    assert(state.preview.startsWith('g_{ij}='), `${id}: live preview missing`);
    assert(state.note.length > 10, `${id}: preset note missing`);
    assert(state.status.startsWith('Loaded '), `${id}: load status missing: ${state.status}`);

    await page.evaluate(() => {
      document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });
      const metric = document.querySelector('[data-output="metric"]');
      metric.checked = true;
      metric.dispatchEvent(new Event('change', {bubbles: true}));
      window.__riemannianLastResult = null;
    });
    await page.click('#calculateSelected');
    await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 20000});
    await page.waitForFunction(() => window.__riemannianLastResult !== null, {timeout: 3000});
    const metric = await page.evaluate(() => window.__riemannianLastResult.metric);
    assert(Array.isArray(metric) && metric.length === 4, `${id}: worker did not return a 4D metric`);
    await sleep(100);
    return state;
  }

  for (const [id, functions, constants] of expected) {
    const state = await loadPreset(id, functions, constants);
    if (id === 'spherical-general') {
      assert(state.cells[0] === '-A(r)' && state.cells[5] === 'B(r)', 'General spherical preset has the wrong A/B entries.');
    }
    if (id === 'kerr-bl') {
      assert(state.coords.join(',') === 't,r,theta,phi', 'Kerr coordinates are wrong.');
      assert(state.cells[3].includes('M*a*r') && state.cells[12] === state.cells[3], 'Kerr g_tphi entry is missing or not symmetric.');
      assert(state.preview.includes('\\sin') && state.preview.includes('\\cos'), 'Kerr preview is missing angular functions.');
    }
    if (id === 'bianchi-i') {
      assert(state.coords.join(',') === 't,x,y,z', 'Bianchi I coordinates are wrong.');
      assert(state.cells[5] === 'a(t)^2' && state.cells[10] === 'b(t)^2' && state.cells[15] === 'c(t)^2', 'Bianchi I directional scale factors are wrong.');
    }
  }

  // Validate two standard curvature identities without making Kerr part of the heavy path.
  await page.select('#presetSelect', 'reissner-nordstrom');
  await page.click('#loadPreset');
  await page.evaluate(() => {
    document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });
    const scalar = document.querySelector('[data-output="scalar"]');
    scalar.checked = true; scalar.dispatchEvent(new Event('change', {bubbles: true}));
    window.__riemannianLastResult = null;
  });
  await page.click('#calculateSelected');
  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 30000});
  const rnScalar = await page.evaluate(() => window.__riemannianLastResult?.scalar);
  assert(String(rnScalar).replace(/\s+/g, '') === '0', `Reissner–Nordström Ricci scalar should vanish: ${rnScalar}`);

  await page.select('#presetSelect', 'desitter-static');
  await page.click('#loadPreset');
  await page.evaluate(() => { window.__riemannianLastResult = null; });
  await page.click('#calculateSelected');
  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 30000});
  const dsScalar = await page.evaluate(() => window.__riemannianLastResult?.scalar);
  const dsValue = await page.evaluate(expr => math.evaluate(expr, {Lambda: 0.3, x1: 0, x2: 2, x3: 0.7, x4: 0.2}), dsScalar);
  assert(Math.abs(dsValue - 1.2) < 1e-8, `de Sitter scalar should be 4 Lambda: ${dsScalar}`);

  const mathErrors = await page.$$eval('mjx-merror', nodes => nodes.map(n => n.textContent));
  assert(mathErrors.length === 0, `MathJax errors: ${JSON.stringify(mathErrors)}`);
  assert(browserErrors.length === 0, `Browser errors: ${JSON.stringify(browserErrors)}`);
  console.log('RIEMANNIAN_EXTRA_PRESETS_REGRESSION_PASS');
  await browser.close();
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
