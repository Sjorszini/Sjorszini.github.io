from pathlib import Path
import re

calc=Path('riemannian-calculator.js')
text=calc.read_text()
text=text.replace('riemannian-worker.js?v=4','riemannian-worker-connection-fast.js?v=1')
calc.write_text(text)

html=Path('Finsler.html')
text=html.read_text().replace('riemannian-calculator.js?v=5','riemannian-calculator.js?v=6')
html.write_text(text)

changed=[]
for path in Path('.').glob('*.html'):
    text=path.read_text()
    start=text.find('<menu id="site-menu">')
    if start < 0:
        continue
    end=text.find('</menu>', start)
    if end < 0:
        continue
    block=text[start:end]
    if 'href="Finsler.html"' not in block:
        calc_item='    <menu-item><a href="Finsler.html">Calc</a></menu-item>\n'
        contact=re.search(r'(?m)^(\s*<menu-item(?: class="currentpage")?><a href="contact\.html">Contact</a></menu-item>)', block)
        if contact:
            block=block[:contact.start()]+calc_item+block[contact.start():]
        else:
            block=block.rstrip()+"\n"+calc_item
        text=text[:start]+block+text[end:]
        path.write_text(text)
        changed.append(path.name)

test=Path('tests/riemannian-extra-presets-regression.cjs')
text=test.read_text()
if 'KERR_CONNECTION_MS' not in text:
    anchor="  assert(kerrIdentityError < 1e-8, `Kerr inverse failed numerical identity check: ${kerrIdentityError}`);\n"
    insert='''\n\n  // Kerr connection must use sparse inverse support and lower-index symmetry.\n  await page.evaluate(() => {\n    document.querySelectorAll('[data-output]').forEach(n => { n.checked = false; });\n    const gamma = document.querySelector('[data-output="christoffel"]');\n    gamma.checked = true; gamma.dispatchEvent(new Event('change', {bubbles: true}));\n    window.__riemannianLastResult = null;\n  });\n  const kerrConnectionStarted = Date.now();\n  await page.click('#calculateSelected');\n  await page.waitForFunction(() => document.querySelector('#status')?.classList.contains('is-success'), {timeout: 20000});\n  const kerrConnectionMs = Date.now() - kerrConnectionStarted;\n  const kerrGamma = await page.evaluate(() => {\n    const parts = window.__riemannianLastResult?.christoffel || [];\n    const scope = {M:1, a:0, x1:0, x2:5, x3:1.1, x4:0};\n    function value(i,j,k) {\n      const part=parts.find(c => c.i===i && c.j===j && c.k===k);\n      return part ? math.evaluate(part.value, scope) : 0;\n    }\n    return {ttr:value(0,0,1), rtt:value(1,0,0), rrr:value(1,1,1), rthth:value(1,2,2)};\n  });\n  console.log(`KERR_CONNECTION_MS ${kerrConnectionMs}`);\n  assert(kerrConnectionMs < 12000, `Kerr Levi-Civita connection took too long: ${kerrConnectionMs} ms`);\n  assert(Math.abs(kerrGamma.ttr-1/15) < 1e-7, `Kerr a=0 Gamma^t_tr mismatch: ${kerrGamma.ttr}`);\n  assert(Math.abs(kerrGamma.rtt-3/125) < 1e-7, `Kerr a=0 Gamma^r_tt mismatch: ${kerrGamma.rtt}`);\n  assert(Math.abs(kerrGamma.rrr+1/15) < 1e-7, `Kerr a=0 Gamma^r_rr mismatch: ${kerrGamma.rrr}`);\n  assert(Math.abs(kerrGamma.rthth+3) < 1e-7, `Kerr a=0 Gamma^r_thth mismatch: ${kerrGamma.rthth}`);\n'''
    if anchor not in text:
        raise SystemExit('Kerr inverse anchor not found')
    text=text.replace(anchor,anchor+insert)
if 'MENU_CALC_LINKS_PASS' not in text:
    anchor="  const mathErrors = await page.$$eval('mjx-merror', nodes => nodes.map(n => n.textContent));\n"
    insert='''  for (const navPath of ['index.html','publications.html','teaching.html','pianist.html','Balls.html','Finsler.html','contact.html']) {\n    const navPage=await browser.newPage();\n    await navPage.goto(`http://127.0.0.1:8000/${navPath}`, {waitUntil:'domcontentloaded', timeout:30000});\n    const count=await navPage.$$eval('#site-menu a[href="Finsler.html"]', nodes => nodes.length);\n    assert(count===1, `${navPath}: expected exactly one Calc menu link, got ${count}`);\n    await navPage.close();\n  }\n  console.log('MENU_CALC_LINKS_PASS');\n\n'''
    if anchor not in text:
        raise SystemExit('menu-test anchor not found')
    text=text.replace(anchor,insert+anchor)
test.write_text(text)

for path in Path('.').glob('*.html'):
    text=path.read_text()
    start=text.find('<menu id="site-menu">')
    if start < 0:
        continue
    end=text.find('</menu>', start)
    block=text[start:end]
    if block.count('href="Finsler.html"') != 1:
        raise SystemExit(f'{path}: Calc menu count is not one')

print('MENU_STATIC_AUDIT_PASS', ','.join(changed) if changed else 'no changes needed')
