import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
await import('./prepare-playwright.mjs');
const { chromium } = await import('playwright');
const root = resolve(process.argv[2]); const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw Error('Invalid path');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const report = { startedUtc: new Date().toISOString(), root, serverPid: process.pid, tests: [], console: [] };
const browserServer = await chromium.launchServer({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false,
  ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], args: ['--no-first-run'] });
report.browserPid = browserServer.process().pid;
const browser = await chromium.connect(browserServer.wsEndpoint()); report.browserVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const delay = ms => new Promise(r => setTimeout(r, ms));
const assert = (v, m) => { if (!v) throw Error(m); };
console.log(JSON.stringify({ serverPid: process.pid, browserPid: report.browserPid, url }));
async function test(name, fn) {
  const result = { name }; report.tests.push(result);
  try { result.evidence = await fn(); result.passed = true; } catch (e) { result.passed = false; result.error = e.stack; }
  console.log(JSON.stringify(result)); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
}
async function pageFor(query = '', beforeNavigation) {
  const page = await context.newPage();
  page.on('pageerror', e => report.console.push({ type: 'pageerror', text: e.stack }));
  page.on('console', m => { if (m.type() === 'error') report.console.push({ type: 'error', text: m.text() }); });
  if (beforeNavigation) await beforeNavigation(page);
  await page.goto(url + '/' + query, { waitUntil: 'domcontentloaded' }); await page.bringToFront(); return page;
}
async function running(page) {
  await page.waitForFunction(() => probe.snapshot()[0]?.Draw > 5 || probe.events.some(e => e.type === 'error' || e.type === 'page-error'), null, { timeout: 90000, polling: 100 });
  const s = await page.evaluate(() => ({ stats: probe.snapshot(), events: probe.events, ready: probe.readyState }));
  assert(s.stats[0]?.Draw > 5 && s.stats[0].PixelsPassed, JSON.stringify(s)); return s;
}
async function stopped(page, mode = 'host') {
  await page.evaluate(mode => { if (mode === 'game') probe.exit(); else void probe.stop(); }, mode);
  await page.waitForFunction(() => probe.host.isDisposed && probe.snapshot()[0]?.Dispose === 1, null, { timeout: 5000, polling: 50 });
  const before = await page.evaluate(() => probe.snapshot()[0]); await delay(300);
  const after = await page.evaluate(() => probe.snapshot()[0]);
  assert(before.Draw === after.Draw && before.Update === after.Update && after.Dispose === 1 && after.Exiting === 1, JSON.stringify({ before, after })); return { before, after };
}
try {
  await test('startup-gpu-and-game-exit', async () => {
    const p = await pageFor(); try { const start = await running(p); await p.screenshot({ path: resolve(output, 'drawing.png') }); return { start, stop: await stopped(p, 'game') }; } finally { await p.close(); }
  });
  await test('real-background-foreground', async () => {
    const p = await pageFor(); let other;
    try {
      await running(p); await p.locator('canvas').click({ position: { x: 400, y: 80 } });
      other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
      await p.waitForFunction(() => document.hidden, null, { polling: 100 }); await delay(300);
      const before = await p.evaluate(() => ({ stats: probe.snapshot()[0], visibility: document.visibilityState, focus: document.hasFocus() }));
      await delay(1200); const hidden = await p.evaluate(() => probe.snapshot()[0]);
      assert(before.stats.Simulation === hidden.Simulation, 'Simulation advanced while hidden');
      await p.bringToFront(); await p.locator('canvas').click({ position: { x: 400, y: 80 } });
      await p.waitForFunction(n => probe.snapshot()[0].Simulation > n && probe.snapshot()[0].Active, hidden.Simulation);
      const resumed = await p.evaluate(() => probe.snapshot()[0]); assert(resumed.Deactivated > 0 && resumed.Activated > 1, 'Activation events missing');
      return { before, hidden, resumed, stop: await stopped(p) };
    } finally { await other?.close(); await p.close(); }
  });
  await test('host-stop-idempotent', async () => {
    const p = await pageFor(); try { await running(p); const identity = await p.evaluate(() => { const a = probe.host.stop(); const b = probe.host.stop(); return a === b; }); assert(identity, 'Repeated stop promises differ'); return await stopped(p); } finally { await p.close(); }
  });
  await test('stop-from-first-frame-callback', async () => {
    const p = await pageFor('?stopFirstFrame=1'); try {
      await p.waitForFunction(() => probe.host.isDisposed, null, { timeout: 10000, polling: 50 });
      const s = await p.evaluate(() => probe.snapshot()[0]); assert(s?.Dispose === 1 && s.Exiting === 1, JSON.stringify(s)); return s;
    } finally { await p.close(); }
  });
  await test('stop-before-managed-first-frame', async () => {
    const p = await pageFor('?managedGate=1'); try {
      await p.waitForFunction(() => probe.control && probe.events.some(e => e.type === 'status' && e.data.message === 'Managed application launched.'));
      await p.evaluate(() => { void probe.stop(); probe.releaseManaged(); });
      await p.waitForFunction(() => probe.host.isDisposed && probe.stopSettled, null, { timeout: 5000, polling: 50 });
      const evidence = await p.evaluate(() => ({ stats: probe.snapshot(), ready: probe.readyState, readyError: probe.readyError }));
      assert(evidence.ready === 'rejected' && evidence.stats[0]?.Draw === 0 && evidence.stats[0]?.Dispose === 1, JSON.stringify(evidence)); return evidence;
    } finally { await p.close(); }
  });
  for (const [name, pattern] of [['stop-during-runtime-load', '**/_framework/dotnet.js'], ['stop-during-content-staging', '**/_monogame/content-manifest.txt']]) {
    await test(name, async () => {
      let release; let entered = false; const gate = new Promise(r => { release = r; });
      const p = await pageFor('', async page => { await page.route(pattern, async route => { entered = true; await gate; await route.continue(); }); });
      try {
        const limit = Date.now() + 10000; while (!entered && Date.now() < limit) await delay(20); assert(entered, 'Expected startup barrier was not reached');
        await p.evaluate(() => { void probe.stop(); }); await delay(100);
        const pending = await p.evaluate(() => !probe.stopSettled); release();
        await p.waitForFunction(() => probe.stopSettled && probe.host.isDisposed, null, { timeout: 5000, polling: 50 });
        const evidence = await p.evaluate(() => ({ stats: probe.snapshot(), ready: probe.readyState, readyError: probe.readyError }));
        assert(pending && evidence.ready === 'rejected' && evidence.stats.length === 0, JSON.stringify(evidence)); return { pending, ...evidence };
      } finally { release(); await p.close(); }
    });
  }
  await test('host-stop-while-hidden', async () => {
    const p = await pageFor(); let other;
    try {
      await running(p); other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
      await p.waitForFunction(() => document.hidden, null, { polling: 100 }); await delay(200);
      report.hiddenStopBefore = await p.evaluate(() => ({ hidden: document.hidden, stats: probe.snapshot() }));
      try { return await stopped(p); }
      finally { report.hiddenStopAfter = await p.evaluate(() => ({ hidden: document.hidden, settled: probe.stopSettled, disposed: probe.host.isDisposed, stats: probe.snapshot() })); }
    } finally { await other?.close(); await p.close(); }
  });
  await test('context-loss-terminal', async () => {
    const p = await pageFor(); try {
      await running(p); await p.evaluate(() => probe.loseContext());
      await p.waitForFunction(() => probe.host.isDisposed && probe.snapshot()[0]?.Dispose === 1, null, { timeout: 5000, polling: 50 });
      const before = await p.evaluate(() => ({ stats: probe.snapshot()[0], errors: probe.events.filter(e => e.type === 'error') })); await delay(300);
      const after = await p.evaluate(() => probe.snapshot()[0]);
      assert(before.stats.Draw === after.Draw && before.errors.some(e => e.data.code === 'webgl_context_lost'), JSON.stringify({ before, after })); return { before, after };
    } finally { await p.close(); }
  });
} finally {
  await context.close(); await browser.close(); await browserServer.close(); await new Promise(r => server.close(r));
  report.finishedUtc = new Date().toISOString(); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
}
process.exitCode = report.tests.some(t => !t.passed) ? 1 : 0;
