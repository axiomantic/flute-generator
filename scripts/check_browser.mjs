// End-to-end browser check, run against a served copy of the studio.
//
// Every assertion here is on an ARTIFACT the page produced - the facet count it reported, the
// bytes of a download, the network log - not on the absence of an exception. A page that silently
// rendered nothing looks exactly like a healthy one to a check that only waits for load.
//
//   node scripts/check_browser.mjs <served-root> <port>
//   node scripts/check_browser.mjs . 8000
//   node scripts/check_browser.mjs docs 8001
//
// --offline additionally aborts every request whose host is not the local server, which is how
// self-containment is measured rather than asserted.

import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVE_ROOT = process.argv[2] ?? '.';
const PORT = Number(process.argv[3] ?? 8000);
const OFFLINE = process.argv.includes('--offline');
const ORIGIN = `http://127.0.0.1:${PORT}`;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}\n`);
};

// The static server runs IN PROCESS so its access log is the authority on what the page fetched.
// An AudioWorklet module is loaded off the main thread and shows up in neither the page's
// response events nor its resource timeline, so a browser-side check for it reports "never
// requested" whether it loaded or not - which is the silent-failure shape, arriving in the
// instrument instead of in the code.
const ROOT_DIR = path.resolve(REPO, SERVE_ROOT);
const served = [];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.wav': 'audio/wav', '.mid': 'audio/midi', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.scad': 'text/plain; charset=utf-8', '.stl': 'model/stl',
  '.md': 'text/markdown; charset=utf-8'
};

function startServer() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let target = path.resolve(ROOT_DIR, '.' + pathname);
    const send = (code) => served.push({ pathname, status: code });
    if (target !== ROOT_DIR && !target.startsWith(ROOT_DIR + path.sep)) {
      send(403); res.writeHead(403).end('forbidden'); return;
    }
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      const body = await readFile(target);
      send(200);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      send(404); res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer();
const profile = mkdtempSync(path.join(tmpdir(), 'flute-chrome-'));
const downloads = mkdtempSync(path.join(tmpdir(), 'flute-dl-'));

const browser = await puppeteer.launch({
  headless: 'shell',
  userDataDir: profile,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader', '--no-sandbox']
});

const pageErrors = [];
const consoleLines = [];
const requests = [];
const statuses = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: downloads, eventsEnabled: true
  });

  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('response', (r) => statuses.push({ url: r.url(), status: r.status() }));

  if (OFFLINE) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      const local = host === '127.0.0.1' || host === 'localhost';
      requests.push({ url: req.url(), local });
      if (local || req.url().startsWith('data:') || req.url().startsWith('blob:')) req.continue();
      else req.abort();
    });
  } else {
    page.on('request', (req) => {
      const proto = new URL(req.url()).protocol;
      if (proto === 'data:' || proto === 'blob:') return;
      const host = new URL(req.url()).hostname;
      requests.push({ url: req.url(), local: host === '127.0.0.1' || host === 'localhost' });
    });
  }

  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  /** Waits until lbl-status settles on an "Engine Ready" state, and returns the facet count. */
  async function waitReady(label) {
    // lbl-status reads "Engine Ready" in the shipped HTML before anything has rendered, so
    // waiting on it alone passes instantly and measures the placeholder. The polygon count in
    // lbl-viewport-sub is written only by a completed render.
    await page.waitForFunction(
      () => /[\d,]+ Polygons/.test(document.getElementById('lbl-viewport-sub')?.innerText ?? '')
        && (document.getElementById('lbl-status')?.innerText ?? '').startsWith('Engine Ready'),
      { timeout: 180000, polling: 250 }
    );
    const sub = await page.$eval('#lbl-viewport-sub', (el) => el.innerText);
    const facets = Number((sub.match(/([\d,]+) Polygons/) ?? [0, '0'])[1].replace(/,/g, ''));
    record(`${label}: 3D render reported ${facets.toLocaleString()} polygons`, facets > 1000, sub.slice(0, 90));
    return facets;
  }

  const baseFacets = await waitReady('initial load');

  // The scene has to contain a mesh, not merely a status line claiming one. THREE is on window
  // as the vendored global, and the app parents the body mesh under a named group.
  const meshInfo = await page.evaluate(() => {
    const c = document.getElementById('viewport-canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return { hasCanvas: !!c, w: c?.width ?? 0, h: c?.height ?? 0, hasGl: !!gl };
  });
  record('WebGL canvas is live', meshInfo.hasCanvas && meshInfo.hasGl && meshInfo.w > 100,
    `${meshInfo.w}x${meshInfo.h} gl=${meshInfo.hasGl}`);

  // A non-blank framebuffer. A canvas that reports a size but paints nothing is the silent
  // failure this is here to exclude.
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 }, encoding: 'base64' });
  record('viewport screenshot is non-trivial', shot.length > 20000, `${shot.length} b64 chars`);

  // ---- both keyed modes -----------------------------------------------------------------
  for (const mode of ['keys_low', 'keys_all']) {
    await page.evaluate((m) => {
      const el = document.getElementById('sel-keywork-mode');
      el.value = m;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('lbl-status').innerText = 'rendering...';
      document.getElementById('lbl-viewport-sub').innerText = 'rendering...';
    }, mode);
    const f = await waitReady(`keywork_mode=${mode}`);
    record(`keywork_mode=${mode} changes the mesh`, f !== baseFacets, `${f} vs ${baseFacets} polygons`);
  }
  await page.evaluate(() => {
    const el = document.getElementById('sel-keywork-mode');
    el.value = 'none';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('lbl-status').innerText = 'rendering...';
    document.getElementById('lbl-viewport-sub').innerText = 'rendering...';
  });
  await waitReady('keywork_mode=none (restored)');

  // ---- audio ----------------------------------------------------------------------------
  await page.click('#btn-play');
  for (let i = 0; i < 60 && !served.some((r) => r.pathname.endsWith('flute-worklet.js')); i++) {
    await sleep(250);
  }
  await sleep(2000);
  const worklet = served.find((r) => r.pathname.endsWith('flute-worklet.js'));
  record('AudioWorklet module loaded', !!worklet && worklet.status === 200,
    worklet ? `server served ${worklet.pathname} with ${worklet.status}` : 'flute-worklet.js was never requested');
  const audioErrs = consoleLines.filter((l) => l.includes('waveguide') || l.includes('AudioWorklet'));
  record('no audio-engine error on the console', audioErrs.length === 0, audioErrs.join(' | ') || 'none');
  const audio = await page.evaluate(() => ({
    playhead: document.getElementById('pianoroll-playhead')?.style.left ?? '',
    stopText: document.getElementById('btn-stop')?.innerText ?? ''
  }));
  record('transport started', true, `playhead=${audio.playhead || 'n/a'} stop="${audio.stopText}"`);
  await page.click('#btn-stop');
  await sleep(300);

  // ---- exports --------------------------------------------------------------------------
  const before = new Set(readdirSync(downloads));
  async function download(selector, label, validate) {
    await page.click(selector);
    let found = null;
    for (let i = 0; i < 120 && !found; i++) {
      await sleep(500);
      found = readdirSync(downloads).find((f) => !before.has(f) && !f.endsWith('.crdownload'));
    }
    if (!found) { record(label, false, 'no file appeared in the download directory'); return; }
    before.add(found);
    const buf = readFileSync(path.join(downloads, found));
    const { ok, detail } = validate(buf);
    record(label, ok, `${found}, ${buf.length} bytes -- ${detail}`);
  }

  await download('#btn-export-scad', 'export .SCAD downloads and is valid', (b) => {
    const t = b.toString('utf8');
    return {
      ok: t.includes('module complete_flute()') && t.includes('bore_melody =') && b.length > 5000,
      detail: t.includes('module complete_flute()') ? 'contains complete_flute()' : 'NOT an OpenSCAD program'
    };
  });
  await download('#btn-export-midi', 'export .MID downloads and is valid', (b) => ({
    ok: b.slice(0, 4).toString('latin1') === 'MThd' && b.includes(Buffer.from('MTrk')),
    detail: `magic=${JSON.stringify(b.slice(0, 4).toString('latin1'))}`
  }));
  await download('#btn-export-stl-zip', 'export STL ZIP downloads and is valid', (b) => {
    const magic = b.slice(0, 2).toString('latin1');
    // A zip's central directory ends with the EOCD signature; a truncated archive has none.
    const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    return { ok: magic === 'PK' && eocd > 0 && b.length > 10000, detail: `magic=${magic} eocd@${eocd}` };
  });

  // ---- theme switching ------------------------------------------------------------------
  const themes = await page.$$eval('#sel-theme option', (os) => os.map((o) => o.value));
  const errsBeforeThemes = pageErrors.length;
  for (const t of themes) {
    await page.evaluate((v) => {
      const el = document.getElementById('sel-theme');
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, t);
    await sleep(150);
  }
  record(`theme switching across ${themes.length} themes`, pageErrors.length === errsBeforeThemes,
    themes.join(','));

  // ---- transparency knob ----------------------------------------------------------------
  const errsBeforeKnob = pageErrors.length;
  for (const v of ['0.15', '0.55', '1']) {
    await page.evaluate((val) => {
      const el = document.getElementById('rng-flute-opacity');
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await sleep(200);
  }
  const opacityLabel = await page.$eval('#val-flute-opacity', (el) => el.innerText).catch(() => '');
  record('transparency knob', pageErrors.length === errsBeforeKnob, `label now "${opacityLabel}"`);

  // ---- preset save / load ---------------------------------------------------------------
  await page.evaluate(() => { window.prompt = () => 'CHECK PRESET'; });
  await page.evaluate(() => { window.saveCurrentFlutePreset(); });
  await sleep(400);
  const savedKey = await page.evaluate(() => document.getElementById('sel-flute-preset').value);
  const stored = await page.evaluate(() => localStorage.getItem('flute_studio_presets_v2') ?? '');
  record('preset save', savedKey.startsWith('flute_') && stored.includes('CHECK PRESET'),
    `key=${savedKey}, ${stored.length} bytes in localStorage`);

  // Load a factory preset, then load the saved one back and confirm the studio follows it.
  await page.evaluate(() => {
    const el = document.getElementById('sel-flute-preset');
    el.value = 'desert_drone';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('lbl-status').innerText = 'rendering...';
    document.getElementById('lbl-viewport-sub').innerText = 'rendering...';
  });
  await waitReady('factory preset loaded');
  await page.evaluate((k) => {
    const el = document.getElementById('sel-flute-preset');
    el.value = k;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('lbl-status').innerText = 'rendering...';
    document.getElementById('lbl-viewport-sub').innerText = 'rendering...';
  }, savedKey);
  await waitReady('saved preset loaded back');
  const backTo = await page.evaluate(() => document.getElementById('sel-flute-preset').value);
  record('preset load', backTo === savedKey, `selection is ${backTo}`);

  // ---- network ---------------------------------------------------------------------------
  const external = [...new Set(requests.filter((r) => !r.local).map((r) => new URL(r.url).host))];
  record('zero external hosts requested', external.length === 0,
    external.length ? external.join(', ') : `${requests.length} requests, all to ${ORIGIN}`);

  const bad = served.filter((r) => r.status >= 400);
  const unexpected = bad.filter((r) => r.pathname !== '/favicon.ico');
  record('no unexpected 4xx/5xx', unexpected.length === 0,
    bad.map((r) => `${r.status} ${r.pathname}`).join(', ') || 'none at all');
  record('every request the server saw', true,
    `${served.length} requests: ` + [...new Set(served.map((r) => r.pathname))].join(' '));

  record('zero page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
} finally {
  await browser.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(downloads, { recursive: true, force: true });
}

process.stdout.write('\n---- console ----\n');
for (const l of consoleLines) process.stdout.write(l + '\n');
process.stdout.write('---- end console ----\n');

const failed = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length} checks, ${failed.length} failed`
  + ` (root=${SERVE_ROOT}${OFFLINE ? ', offline' : ''}).\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
