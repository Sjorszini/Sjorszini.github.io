'use strict';

const fs = require('fs');
const path = require('path');
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
    const root = path.resolve(__dirname, '..');
    const pages = fs.readdirSync(root)
      .filter(name => name.endsWith('.html'))
      .filter(name => fs.readFileSync(path.join(root, name), 'utf8').includes('<menu id="site-menu">'))
      .sort();

    assert(pages.length > 0, 'No pages with the shared site menu were found.');

    for (const name of pages) {
      const page = await browser.newPage();
      const browserErrors = [];
      page.on('pageerror', err => browserErrors.push(String(err)));
      await page.goto(`http://127.0.0.1:8000/${encodeURIComponent(name)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      const links = await page.$$eval('#site-menu a[href="Finsler.html"]', nodes => nodes.map(n => n.textContent.trim()));
      assert(links.length === 1, `${name}: expected exactly one calculator menu link, got ${links.length}.`);
      assert(links[0] === 'Calc', `${name}: calculator menu label should be Calc, got ${JSON.stringify(links[0])}.`);
      assert(browserErrors.length === 0, `${name}: browser errors: ${JSON.stringify(browserErrors)}`);
      await page.close();
    }

    console.log(`SITE_MENU_REGRESSION_PASS ${pages.length} pages`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
