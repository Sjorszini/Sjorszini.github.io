'use strict';

const puppeteer = require('puppeteer-core');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', err => browserErrors.push(String(err)));
    await page.goto('http://127.0.0.1:8000/Finsler.html', {waitUntil: 'networkidle0', timeout: 30000});
    await page.waitForSelector('#presetSelect option[value="kerr-bl"]', {timeout: 10000});
    await page.select('#presetSelect', 'kerr-bl');
    await page.click('#loadPreset');

    await page.evaluate(() => {
      document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });
      const gamma = document.querySelector('[data-output="christoffel"]');
      gamma.checked = true;
      gamma.dispatchEvent(new Event('change', {bubbles: true}));
      window.__riemannianLastResult = null;
    });

    const started = Date.now();
    await page.click('#calculateSelected');
    await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 15000});
    const elapsed = Date.now() - started;

    const check = await page.evaluate(() => {
      const parts = window.__riemannianLastResult?.christoffel || [];
      const scope = {M: 1, a: 0, x1: 0, x2: 5, x3: 1.1, x4: 0};
      function value(i,j,k) {
        const part = parts.find(c => c.i === i && c.j === j && c.k === k);
        return part ? math.evaluate(part.value, scope) : 0;
      }
      return {
        count: parts.length,
        ttr: value(0,0,1),
        rtt: value(1,0,0),
        rrr: value(1,1,1),
        rthth: value(1,2,2)
      };
    });

    console.log(`KERR_CONNECTION_MS ${elapsed}`);
    assert(elapsed < 12000, `Kerr Levi-Civita connection took too long: ${elapsed} ms`);
    assert(check.count > 0, 'Kerr connection returned no nonzero components.');
    assert(Math.abs(check.ttr - 1/15) < 1e-7, `Kerr a=0 Gamma^t_tr mismatch: ${check.ttr}`);
    assert(Math.abs(check.rtt - 3/125) < 1e-7, `Kerr a=0 Gamma^r_tt mismatch: ${check.rtt}`);
    assert(Math.abs(check.rrr + 1/15) < 1e-7, `Kerr a=0 Gamma^r_rr mismatch: ${check.rrr}`);
    assert(Math.abs(check.rthth + 3) < 1e-7, `Kerr a=0 Gamma^r_thth mismatch: ${check.rthth}`);
    assert(browserErrors.length === 0, `Browser errors: ${JSON.stringify(browserErrors)}`);
    console.log('KERR_CONNECTION_REGRESSION_PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
