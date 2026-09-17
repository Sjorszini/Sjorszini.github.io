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
    {id:'spherical-general', n:4, functions:'A(r), B(r)', constants:''},
    {id:'reissner-nordstrom', n:4, functions:'', constants:'M, Q'},
    {id:'desitter-static', n:4, functions:'', constants:'Lambda'},
    {id:'ads-static', n:4, functions:'', constants:'L'},
    {id:'kerr-bl', n:4, functions:'', constants:'M, a'},
    {id:'schwarzschild-ef', n:4, functions:'', constants:'r_s'},
    {id:'godel', n:4, functions:'', constants:'L'},
    {id:'ellis-wormhole', n:4, functions:'', constants:'b'},
    {id:'rindler', n:4, functions:'', constants:'alpha'},
    {id:'alcubierre', n:4, functions:'F(t,x,y,z)', constants:'v'},
    {id:'bianchi-i', n:4, functions:'a(t), b(t), c(t)', constants:''},
    {id:'kasner', n:4, functions:'', constants:'p_1, p_2, p_3'},
    {id:'btz-rotating', n:3, functions:'', constants:'M, J, L'}
  ];
  const optionValues = await page.$$eval('#presetSelect option', nodes => nodes.map(n => n.value));
  for (const item of expected) assert(optionValues.includes(item.id), `Missing preset option ${item.id}`);

  async function loadPreset(item) {
    await page.select('#presetSelect', item.id);
    await page.click('#loadPreset');
    await page.waitForFunction(id => document.querySelector('#presetSelect')?.value === id, {}, item.id);
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
    assert(state.dim === String(item.n), `${item.id}: expected dimension ${item.n}, got ${state.dim}`);
    assert(state.functions === item.functions, `${item.id}: wrong functions declaration: ${state.functions}`);
    assert(state.constants === item.constants, `${item.id}: wrong constants declaration: ${state.constants}`);
    assert(state.cells.length === item.n * item.n, `${item.id}: wrong metric editor size`);
    assert(state.preview.startsWith('g_{ij}='), `${item.id}: live preview missing`);
    assert(state.note.length > 10, `${item.id}: preset note missing`);
    assert(state.status.startsWith('Loaded '), `${item.id}: load status missing: ${state.status}`);

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
    assert(Array.isArray(metric) && metric.length === item.n, `${item.id}: worker returned wrong metric dimension`);
    return state;
  }

  for (const item of expected) {
    const state = await loadPreset(item);
    if (item.id === 'spherical-general') {
      assert(state.cells[0] === '-A(r)' && state.cells[5] === 'B(r)', 'General spherical preset has the wrong A/B entries.');
    }
    if (item.id === 'kerr-bl') {
      assert(state.coords.join(',') === 't,r,theta,phi', 'Kerr coordinates are wrong.');
      assert(state.cells[3].includes('M*a*r') && state.cells[12] === state.cells[3], 'Kerr g_tphi entry is missing or not symmetric.');
      assert(state.preview.includes('\\sin') && state.preview.includes('\\cos'), 'Kerr preview is missing angular functions.');
    }
    if (item.id === 'godel') {
      assert(state.cells[3].includes('exp(x)') && state.cells[12] === state.cells[3], 'Gödel t-z rotation block is missing.');
    }
    if (item.id === 'alcubierre') {
      assert(state.cells[1] === '-v*F(t,x,y,z)' && state.cells[4] === state.cells[1], 'Alcubierre shift term is missing.');
    }
    if (item.id === 'bianchi-i') {
      assert(state.coords.join(',') === 't,x,y,z', 'Bianchi I coordinates are wrong.');
      assert(state.cells[5] === 'a(t)^2' && state.cells[10] === 'b(t)^2' && state.cells[15] === 'c(t)^2', 'Bianchi I directional scale factors are wrong.');
    }
    if (item.id === 'btz-rotating') {
      assert(state.cells[2] === '-J/2' && state.cells[6] === '-J/2', 'BTZ rotation term is missing.');
    }
  }

  // Kerr must use the generic 2x2 + scalar-block inverse fast path.
  await page.select('#presetSelect', 'kerr-bl');
  await page.click('#loadPreset');
  await page.evaluate(() => {
    document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });
    const inverse = document.querySelector('[data-output="inverse"]');
    inverse.checked = true; inverse.dispatchEvent(new Event('change', {bubbles: true}));
    window.__riemannianLastResult = null;
  });
  const kerrStarted = Date.now();
  await page.click('#calculateSelected');
  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 15000});
  const kerrMs = Date.now() - kerrStarted;
  const kerrIdentityError = await page.evaluate(() => {
    const inv = window.__riemannianLastResult?.inverse?.matrix;
    const cells = Array.from(document.querySelectorAll('.metric-entry')).map(n => n.value);
    if (!inv) return 999;
    const scope = {M:1, a:0.4, r:5, theta:1.1, t:0, phi:0, x1:0, x2:5, x3:1.1, x4:0};
    const g = Array.from({length:4}, (_,i) => Array.from({length:4}, (_,j) => math.evaluate(cells[4*i+j], scope)));
    const gi = inv.map(row => row.map(expr => math.evaluate(expr, scope)));
    let worst = 0;
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) {
      let v=0; for (let k=0;k<4;k++) v += g[i][k]*gi[k][j];
      worst=Math.max(worst, Math.abs(v-(i===j?1:0)));
    }
    return worst;
  });
  console.log(`KERR_INVERSE_MS ${kerrMs}`);
  assert(kerrMs < 10000, `Kerr inverse took too long after block optimization: ${kerrMs} ms`);
  assert(kerrIdentityError < 1e-8, `Kerr inverse failed numerical identity check: ${kerrIdentityError}`);

  async function scalarFor(id, timeout=30000) {
    await page.select('#presetSelect', id);
    await page.click('#loadPreset');
    await page.evaluate(() => {
      document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });
      const scalar = document.querySelector('[data-output="scalar"]');
      scalar.checked = true; scalar.dispatchEvent(new Event('change', {bubbles: true}));
      window.__riemannianLastResult = null;
    });
    await page.click('#calculateSelected');
    await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout});
    return await page.evaluate(() => window.__riemannianLastResult?.scalar);
  }

  const rnScalar = await scalarFor('reissner-nordstrom');
  assert(String(rnScalar).replace(/\s+/g, '') === '0', `Reissner–Nordström Ricci scalar should vanish: ${rnScalar}`);

  const dsScalar = await scalarFor('desitter-static');
  const dsValue = await page.evaluate(expr => math.evaluate(expr, {Lambda:0.3, x1:0, x2:2, x3:0.7, x4:0.2}), dsScalar);
  assert(Math.abs(dsValue - 1.2) < 1e-8, `de Sitter scalar should be 4 Lambda: ${dsScalar}`);

  const adsScalar = await scalarFor('ads-static');
  const adsValue = await page.evaluate(expr => math.evaluate(expr, {L:2, x1:0, x2:1.3, x3:0.8, x4:0.2}), adsScalar);
  assert(Math.abs(adsValue + 3) < 1e-8, `AdS scalar should be -12/L^2: ${adsScalar}`);

  const rindlerScalar = await scalarFor('rindler');
  assert(String(rindlerScalar).replace(/\s+/g, '') === '0', `Rindler spacetime should be flat: ${rindlerScalar}`);

  // Rotating BTZ is deliberately kept to load/preview/worker-input coverage here.
  // Its full symbolic Ricci-scalar contraction is substantially heavier and is not a useful CI speed gate.

  const mathErrors = await page.$$eval('mjx-merror', nodes => nodes.map(n => n.textContent));
  assert(mathErrors.length === 0, `MathJax errors: ${JSON.stringify(mathErrors)}`);
  assert(browserErrors.length === 0, `Browser errors: ${JSON.stringify(browserErrors)}`);
  console.log('RIEMANNIAN_EXTRA_PRESETS_REGRESSION_PASS');
  await browser.close();
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
