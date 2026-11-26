// Offline PR49 browser proof only. Never imported by the production site.
// Run from the repository root with CHROME_BIN, PLAYWRIGHT_MODULE and PROOF_DIR.
// PROOF_DIR must be inside RUNNER_TEMP or the operating system temporary directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep, join } from 'node:path';

const BASE = 'dadadc393eff84abd1025a348557f47364617f8a';
const TARGET = 'a2239aacebaab53e025368354eb11c3db9fad0a2';
const ORIGIN = 'https://totemservices.org';
const PNG = 'assets/illustrations/marketing.png';
const WEBP = 'assets/illustrations/marketing-lossless-v1.webp';
const BUNDLE = 'assets/home-page-v1.css';
const FONT_DIR = 'assets/fonts/totem-search/';
const FONT_PINS = {
  'inter-latin-v20.woff2': 'd15208de03cd1ad7c5199f0a0ce915fe841e4722',
  'manrope-latin-v20.woff2': '71eb731d558046199aa7f985adbf812890a093a1'
};
const STYLE_PROPS = [
  'display', 'position', 'visibility', 'opacity', 'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'text-decoration-line', 'box-sizing', 'width', 'height',
  'max-width', 'max-height', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-radius', 'grid-template-columns', 'object-fit'
];
const profiles = [320, 390, 650, 651, 950, 1280].map(width => ({
  id: String(width) + '-dpr1', width, height: width <= 650 ? 844 : 900, dpr: 1
})).concat([{ id: '390-dpr3', width: 390, height: 844, dpr: 3 }]);
const failures = [];
const summary = {
  purpose: 'Offline deterministic layout, interaction and browser colour proof; not a production performance test.',
  base: BASE, target: TARGET, generatedAt: new Date().toISOString(),
  source: {}, browser: null, runs: [], failures,
  caveats: [
    'All page requests are locally fulfilled or locally blocked; no public hosting/CDN timings are measured.',
    'Google Fonts CSS and preconnect hints are replaced/removed in memory, identically in every variant, using pinned repository Latin font fixtures.',
    'Full-page screenshots use CSS pixels; hero screenshots use device pixels.',
    'Canvas hashes are browser-rendered pixels, not the Pillow raw RGBA hash: canvas alpha premultiplication may alter invisible RGB.',
    'Missing unchanged repository assets and blocked analytics are listed separately, never described as successful loads.'
  ]
};
let proofDir;
let browser;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const show = (ref, path) => git(['show', ref + ':' + path]);
const blob = (ref, path) => git(['rev-parse', ref + ':' + path]).toString().trim();
const sorted = values => [...values].sort();
const record = (ok, label, details = null) => {
  if (!ok) failures.push({ label, details });
  return ok;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (root, path) => {
  const rel = relative(resolve(root), path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
const once = (text, needle, replacement) => {
  assert.equal(text.split(needle).length - 1, 1, 'Expected exactly one source token: ' + needle);
  return text.replace(needle, replacement);
};
const json = (file, value) => writeFile(join(proofDir, file), JSON.stringify(value, null, 2) + '\n');
const fontCSS = [
  "@font-face{font-family:Inter;font-style:normal;font-weight:400 700;font-display:swap;src:url('/__proof_fonts/inter-latin-v20.woff2') format('woff2')}",
  "@font-face{font-family:Manrope;font-style:normal;font-weight:600 800;font-display:swap;src:url('/__proof_fonts/manrope-latin-v20.woff2') format('woff2')}"
].join('\n');
const mime = path => ({
  '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.html': 'text/html'
})[path.slice(path.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream';

async function main() {
  assert(process.env.PROOF_DIR && isAbsolute(process.env.PROOF_DIR), 'PROOF_DIR must be an absolute temporary path');
  proofDir = resolve(process.env.PROOF_DIR);
  assert([tmpdir(), process.env.RUNNER_TEMP].filter(Boolean).some(root => within(root, proofDir)),
    'PROOF_DIR must be a child of RUNNER_TEMP or the OS temporary directory');
  await mkdir(proofDir, { recursive: true });
  assert(process.env.CHROME_BIN && isAbsolute(process.env.CHROME_BIN), 'CHROME_BIN must name installed Chrome explicitly');
  assert(process.env.PLAYWRIGHT_MODULE && isAbsolute(process.env.PLAYWRIGHT_MODULE),
    'PLAYWRIGHT_MODULE must name the pinned installed playwright-core module explicitly');
  const require = createRequire(import.meta.url);
  const pwPath = resolve(process.env.PLAYWRIGHT_MODULE);
  const { chromium } = require(pwPath);
  const pwVersion = require(join(pwPath, 'package.json')).version;
  assert.equal(pwVersion, '1.62.1', 'Playwright version drift');
  assert.equal(STYLE_PROPS.length, 30);

  const oldHTML = show(BASE, 'index.html').toString();
  const newHTML = show(TARGET, 'index.html').toString();
  const oldLinks = [
    '<link rel="stylesheet" href="/assets/style.css?v=20261026-navigation">',
    '<link rel="stylesheet" href="/assets/company-credentials-v1.css">',
    '<link rel="stylesheet" href="/assets/seo-hero-v1.css">'
  ];
  const bundleLink = '<link rel="stylesheet" href="/assets/home-page-v1.css?v=20261123-loading">';
  const img = '<img class="heroimg" src="/assets/illustrations/marketing.png" width="1428" height="1026" alt="Marketing illustration with a megaphone, content and analytics" decoding="async" fetchpriority="high">';
  const picture = '<picture><source type="image/webp" srcset="/assets/illustrations/marketing-lossless-v1.webp">' + img + '</picture>';
  const imageOnly = once(oldHTML, img, picture);
  const cssOnly = once(once(once(oldHTML, oldLinks[0], bundleLink), oldLinks[1], ''), oldLinks[2], '');
  assert.equal(once(cssOnly, img, picture), newHTML, 'HTML changes exceed reviewed replacements');
  assert.deepEqual(sorted(git(['diff', '--name-only', BASE, TARGET]).toString().trim().split('\n')),
    sorted(['index.html', BUNDLE, WEBP]), 'Changed file scope drift');
  const sourceAssetPins = {
    'assets/style.css': '553ad4031676ed5aaafcd1046d141238f69474cd',
    'assets/company-credentials-v1.css': '5a30c08477acbcebea02edf37bebc82cdebe98bf',
    'assets/seo-hero-v1.css': 'fa31064997e00e8a0d1193c4ae4120852f5f5401',
    'assets/site.js': 'f2b0d9ce843050b13bde6280e26df426669d5c18'
  };
  for (const [path, pin] of Object.entries(sourceAssetPins)) {
    assert.equal(blob(BASE, path), pin, 'Base asset drift: ' + path);
    assert.equal(blob(TARGET, path), pin, 'Target asset drift: ' + path);
  }
  const expectedCSS = ['assets/style.css', 'assets/company-credentials-v1.css', 'assets/seo-hero-v1.css']
    .map(path => show(BASE, path).toString()).join('\n');
  assert.equal(show(TARGET, BUNDLE).toString(), expectedCSS, 'CSS contents/order drift');
  assert(!/@import\b|@charset\b|url\s*\(/i.test(expectedCSS), 'Unexpected CSS-relative dependency');
  assert.equal(blob(TARGET, PNG), '7b2509bb8b3fe2dcfb8fdf798c7067069f94ef80');
  assert.equal(blob(BASE, PNG), blob(TARGET, PNG));
  assert.equal(blob(TARGET, WEBP), 'fb0dcb58b855ec3784c6586b6abba7c298d62376');
  const png = show(TARGET, PNG), webp = show(TARGET, WEBP);
  assert.equal(png.length, 93866);
  assert.equal(webp.length, 31908);
  assert.equal(sha256(png), '69e8f13225ca20461a5bbe085f41f2dd456a18a6743cfb9688a4881c13006116');
  assert.equal(sha256(webp), 'f541d165fad4088ac83b5cbadc3a9ca5fb1412f4b08435e3668ff69a488260df');
  const fontBytes = {};
  for (const [name, pin] of Object.entries(FONT_PINS)) {
    assert.equal(blob(TARGET, FONT_DIR + name), pin, 'Font fixture drift: ' + name);
    assert.equal(blob(BASE, FONT_DIR + name), pin, 'Base font fixture drift: ' + name);
    fontBytes[name] = show(TARGET, FONT_DIR + name);
  }
  const trees = Object.fromEntries([BASE, TARGET].map(ref => [ref,
    new Set(git(['ls-tree', '-r', '--name-only', '-z', ref]).toString().split('\0').filter(Boolean))
  ]));
  const cache = new Map();
  const asset = path => {
    if (!cache.has(path)) cache.set(path, show(TARGET, path));
    return cache.get(path);
  };
  const fontsLink = oldHTML.match(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/[^"]+"[^>]*>/g);
  assert.equal(fontsLink?.length, 1, 'Expected one Google Fonts stylesheet');
  const fixtureHTML = html => once(html, fontsLink[0],
    '<link rel="stylesheet" href="/__proof_fonts/fonts.css">')
    .replace(/<link\b[^>]*rel="preconnect"[^>]*>/g, '');
  const variants = { baseline: oldHTML, imageOnly, cssOnly, combined: newHTML };
  summary.source = {
    changedFiles: ['index.html', BUNDLE, WEBP], indexBaseBlob: blob(BASE, 'index.html'),
    indexTargetBlob: blob(TARGET, 'index.html'), bundleBlob: blob(TARGET, BUNDLE),
    cssExactConcatenation: true, htmlExactReplacements: true, unchangedAssetPins: sourceAssetPins,
    png: { blob: blob(TARGET, PNG), bytes: png.length, sha256: sha256(png) },
    webp: { blob: blob(TARGET, WEBP), bytes: webp.length, sha256: sha256(webp) },
    pillowPriorRawRGBA: { width: 1428, height: 1026, exactIncludingTransparentRGB: true,
      sha256: '7d2e47894fac96c44d4b18ee936245b9ca2c8b7fb4287245df999974116a9562' },
    fontFixtures: Object.fromEntries(Object.entries(fontBytes).map(([name, bytes]) =>
      [name, { gitBlob: FONT_PINS[name], bytes: bytes.length, sha256: sha256(bytes) }])),
    comparedStyleProperties: STYLE_PROPS
  };
  await json('source-proof.json', summary.source);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN, headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check']
  });
  summary.browser = { name: 'installed Chrome', version: browser.version(), playwright: pwVersion,
    executable: process.env.CHROME_BIN, platform: process.platform, node: process.version };

  for (const profile of profiles) {
    let control;
    for (const [variant, html] of Object.entries(variants)) {
      const result = await runCase(profile, variant, fixtureHTML(html), variant === 'imageOnly' || variant === 'combined');
      if (variant === 'baseline') control = result;
      else if (control && result) compareRuns(control, result);
    }
    if (profile.dpr === 1 && [390, 1280].includes(profile.width)) {
      const fallback = once(newHTML, 'type="image/webp"', 'type="image/x-unsupported"');
      const result = await runCase(profile, 'unsupportedTypeFallback', fixtureHTML(fallback), false);
      if (control && result) compareRuns(control, result);
    }
  }
  await browser.close();
  browser = null;
  summary.passed = failures.length === 0;
  await json('summary.json', summary);
  console.log(JSON.stringify({ passed: summary.passed, cases: summary.runs.length, failures: failures.length,
    proofDir, source: { base: BASE, target: TARGET }, browser: summary.browser }, null, 2));
  if (failures.length) {
    console.error(JSON.stringify(failures.slice(0, 40), null, 2));
    process.exitCode = 1;
  }

  async function runCase(profile, variant, html, expectsWebP) {
    const id = profile.id + '-' + variant;
    const run = { id, variant, profile, requests: [], missingUnchangedAssets: [], blockedExternal: [],
      policyViolations: [], pageErrors: [], consoleErrors: [], interactions: {}, colour: null };
    summary.runs.push(run);
    let phase = 'initial';
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr,
      locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', serviceWorkers: 'block'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    context.on('page', popup => {
      if (popup !== page) {
        run.policyViolations.push({ kind: 'unexpected-popup', url: popup.url() });
        void popup.close();
      }
    });
    page.on('pageerror', error => run.pageErrors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') run.consoleErrors.push(message.text());
    });
    await context.routeWebSocket('**/*', socket => {
      run.policyViolations.push({ kind: 'websocket', url: socket.url() });
      socket.close();
    });
    await context.addInitScript(() => {
      window.__proofSubmissions = [];
      document.addEventListener('submit', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        window.__proofSubmissions.push({ kind: 'submit-event' });
      }, true);
      HTMLFormElement.prototype.submit = function () {
        window.__proofSubmissions.push({ kind: 'native-submit' });
        throw new Error('Offline proof prohibits form submission');
      };
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const entry = { phase, method: request.method(), url: request.url(), type: request.resourceType() };
      run.requests.push(entry);
      const fulfill = (status, body, contentType) => {
        entry.status = status;
        return route.fulfill({ status, body, contentType, headers: { 'cache-control': 'no-store' } });
      };
      if (request.method() !== 'GET' || ['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) {
        entry.outcome = 'blocked-api-or-non-get'; run.policyViolations.push(entry);
        return fulfill(403, '', 'text/plain');
      }
      if (url.origin !== ORIGIN) {
        entry.outcome = 'blocked-external'; run.blockedExternal.push(entry);
        if (!['www.googletagmanager.com', 'connect.facebook.net', 'www.facebook.com'].includes(url.hostname))
          run.policyViolations.push({ ...entry, kind: 'unexpected-external-host' });
        return fulfill(204, '', 'text/plain');
      }
      if (url.pathname === '/' && request.isNavigationRequest()) {
        entry.outcome = 'offline-document';
        return fulfill(200, html, 'text/html');
      }
      if (url.pathname === '/__proof_fonts/fonts.css') {
        entry.outcome = 'pinned-font-css';
        return fulfill(200, fontCSS, 'text/css');
      }
      if (url.pathname.startsWith('/__proof_fonts/')) {
        const name = url.pathname.slice('/__proof_fonts/'.length);
        if (Object.hasOwn(fontBytes, name)) {
          entry.outcome = 'pinned-font'; entry.bytes = fontBytes[name].length;
          return fulfill(200, fontBytes[name], 'font/woff2');
        }
      }
      let path;
      try { path = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch {}
      if (!path || path.split('/').some(part => part === '..' || part === '.') || path.includes('\0') ||
          path.startsWith('api/') || request.isNavigationRequest()) {
        entry.outcome = 'blocked-unsafe-or-navigation'; run.policyViolations.push(entry);
        return fulfill(403, '', 'text/plain');
      }
      if (!trees[TARGET].has(path)) {
        entry.outcome = 'missing-unchanged-repository-asset';
        if (trees[BASE].has(path) || [PNG, WEBP, BUNDLE].includes(path) || /\.(css|js|woff2?)$/i.test(path))
          run.policyViolations.push({ ...entry, kind: 'missing-required-asset' });
        else run.missingUnchangedAssets.push(path);
        return fulfill(404, '', 'text/plain');
      }
      entry.outcome = 'offline-repository-asset';
      const bytes = asset(path); entry.bytes = bytes.length;
      return fulfill(200, bytes, mime(path));
    });
    try {
      await page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(async () => {
        await Promise.all([400, 500, 600, 700].map(weight => document.fonts.load(weight + ' 16px Inter')));
        await Promise.all([600, 700, 800].map(weight => document.fonts.load(weight + ' 16px Manrope')));
        await document.fonts.ready;
        await document.querySelector('.heroimg').decode();
      });
      run.fonts = await page.evaluate(() => ({
        inter: [400, 500, 600, 700].every(weight => document.fonts.check(weight + ' 16px Inter')),
        manrope: [600, 700, 800].every(weight => document.fonts.check(weight + ' 16px Manrope')),
        faces: [...document.fonts].map(face => ({ family: face.family, weight: face.weight, status: face.status }))
      }));
      record(run.fonts.inter && run.fonts.manrope && run.fonts.faces.length === 2 &&
        run.fonts.faces.every(face => face.status === 'loaded'), id + ': pinned fonts loaded', run.fonts);
      run.hero = await page.locator('.heroimg').evaluate(img => ({
        currentSrc: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight,
        complete: img.complete, loading: img.loading, fetchpriority: img.getAttribute('fetchpriority')
      }));
      // Freeze this count BEFORE intentional reference-image loads and lazy-image scrolling.
      run.initialHeroRequests = run.requests.filter(item => item.phase === 'initial' &&
        [ORIGIN + '/' + PNG, ORIGIN + '/' + WEBP].includes(item.url)).map(item => ({ ...item }));
      run.initialFirstPartyCSS = run.requests.filter(item => item.phase === 'initial' &&
        new URL(item.url).origin === ORIGIN && new URL(item.url).pathname.startsWith('/assets/') &&
        new URL(item.url).pathname.endsWith('.css')).map(item => ({ ...item }));
      const expectedImage = expectsWebP ? WEBP : PNG;
      record(run.initialHeroRequests.length === 1 &&
        run.initialHeroRequests[0].url === ORIGIN + '/' + expectedImage &&
        run.initialHeroRequests[0].status === 200, id + ': exactly one initial hero request', run.initialHeroRequests);
      record(run.hero.currentSrc === ORIGIN + '/' + expectedImage && run.hero.width === 1428 &&
        run.hero.height === 1026 && run.hero.complete && run.hero.fetchpriority === 'high',
        id + ': selected hero and dimensions', run.hero);
      const bundled = variant === 'cssOnly' || variant === 'combined' || variant === 'unsupportedTypeFallback';
      const expectedCSSPaths = bundled ? ['/' + BUNDLE] :
        ['/assets/style.css', '/assets/company-credentials-v1.css', '/assets/seo-hero-v1.css'];
      record(same(sorted(run.initialFirstPartyCSS.map(item => new URL(item.url).pathname)), sorted(expectedCSSPaths)) &&
        run.initialFirstPartyCSS.every(item => item.status === 200),
        id + ': first-party stylesheet request scope', run.initialFirstPartyCSS);

      phase = 'keyboard';
      await page.keyboard.press('Tab');
      run.interactions.skipTab = await page.evaluate(() => ({
        class: document.activeElement?.className, href: document.activeElement?.getAttribute('href')
      }));
      record(run.interactions.skipTab.class === 'seo-skip-link' &&
        run.interactions.skipTab.href === '#main-content', id + ': physical Tab focuses skip link', run.interactions.skipTab);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.id === 'main-content');
      run.interactions.skipEnter = await page.evaluate(() => ({
        focus: document.activeElement?.id, hash: location.hash, tabindex: document.activeElement?.getAttribute('tabindex')
      }));
      record(run.interactions.skipEnter.focus === 'main-content' &&
        run.interactions.skipEnter.hash === '#main-content' && run.interactions.skipEnter.tabindex === '-1',
        id + ': physical Enter follows skip link', run.interactions.skipEnter);
      const button = page.locator('.menuBtn');
      const menuVisible = await button.isVisible();
      record(menuVisible === (profile.width <= 1100), id + ': expected menu breakpoint', { menuVisible });
      if (menuVisible) {
        await button.click();
        run.interactions.menuOpen = await page.locator('.nav').evaluate(nav => ({
          open: nav.classList.contains('open'), display: getComputedStyle(nav).display,
          expanded: document.querySelector('.menuBtn').getAttribute('aria-expanded')
        }));
        record(run.interactions.menuOpen.open && run.interactions.menuOpen.display !== 'none' &&
          run.interactions.menuOpen.expanded === 'true', id + ': menu click opens', run.interactions.menuOpen);
        await button.click();
        run.interactions.menuClosed = await page.locator('.nav').evaluate(nav => ({
          open: nav.classList.contains('open'), display: getComputedStyle(nav).display,
          expanded: document.querySelector('.menuBtn').getAttribute('aria-expanded')
        }));
        record(!run.interactions.menuClosed.open && run.interactions.menuClosed.display === 'none' &&
          run.interactions.menuClosed.expanded === 'false', id + ': menu click closes', run.interactions.menuClosed);
      }
      phase = 'lazy-assets';
      await page.evaluate(async () => {
        document.activeElement?.blur();
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
          scrollTo({ top: y, behavior: 'instant' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        await Promise.all([...document.images].map(img => img.complete ? Promise.resolve() :
          new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })));
        history.replaceState(null, '', '/');
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      run.dom = await page.evaluate(props => {
        const all = [document.documentElement, ...document.body.querySelectorAll('*')];
        all.splice(1, 0, document.body);
        return {
          textContent: document.body.textContent, innerText: document.body.innerText,
          anchors: [...document.querySelectorAll('a')].map(a => ({
            href: a.getAttribute('href'), resolved: a.href, text: a.textContent,
            target: a.target, rel: a.rel, ariaLabel: a.getAttribute('aria-label')
          })),
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
            documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight },
          elements: all.filter(node => !['PICTURE', 'SOURCE', 'SCRIPT'].includes(node.tagName)).map(node => {
            const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
            return { tag: node.tagName, id: node.id, class: node.getAttribute('class') || '',
              geometry: [rect.x, rect.y, rect.width, rect.height],
              styles: Object.fromEntries(props.map(prop => [prop, style.getPropertyValue(prop)])) };
          })
        };
      }, STYLE_PROPS);
      await json(id + '-dom.json', run.dom);
      phase = 'screenshots';
      const full = await page.screenshot({ path: join(proofDir, id + '-full.png'),
        fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' });
      const hero = await page.locator('section.hero.seo-hero').screenshot({ path: join(proofDir, id + '-hero.png'),
        animations: 'disabled', caret: 'hide', scale: 'device' });
      run.screenshots = { full: { path: id + '-full.png', sha256: sha256(full), scale: 'css' },
        hero: { path: id + '-hero.png', sha256: sha256(hero), scale: 'device' } };
      phase = 'reference-colour';
      run.colour = await page.evaluate(async paths => {
        const images = await Promise.all(paths.map(async path => {
          const image = new Image(); image.src = path; await image.decode(); return image;
        }));
        const rect = document.querySelector('.heroimg').getBoundingClientRect();
        const sizes = [[1428, 1026], [Math.max(1, Math.round(rect.width * devicePixelRatio)),
          Math.max(1, Math.round(rect.height * devicePixelRatio))]];
        const results = [];
        const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
        for (const [width, height] of sizes) for (const background of ['transparent', '#ffffff', '#f7f4ed']) {
          const data = images.map(image => {
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
            if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
            ctx.drawImage(image, 0, 0, width, height);
            return ctx.getImageData(0, 0, width, height).data;
          });
          let differentChannels = 0, maxChannelError = 0;
          for (let i = 0; i < data[0].length; i++) {
            const delta = Math.abs(data[0][i] - data[1][i]);
            if (delta) differentChannels++;
            maxChannelError = Math.max(maxChannelError, delta);
          }
          results.push({ width, height, background, pngSHA256: await hash(data[0]),
            webpSHA256: await hash(data[1]), differentChannels, maxChannelError });
        }
        return { imageDimensions: images.map(image => [image.naturalWidth, image.naturalHeight]), results };
      }, ['/' + PNG, '/' + WEBP]);
      record(run.colour.imageDimensions.every(size => same(size, [1428, 1026])) &&
        run.colour.results.every(item => item.differentChannels === 0 && item.maxChannelError === 0 &&
          item.pngSHA256 === item.webpSHA256), id + ': exact browser PNG/WebP RGBA parity', run.colour);
      run.formSubmissions = await page.evaluate(() => window.__proofSubmissions);
      record(run.formSubmissions.length === 0, id + ': no form submission', run.formSubmissions);
      record(run.policyViolations.length === 0, id + ': no forbidden network/navigation', run.policyViolations);
      record(run.pageErrors.length === 0, id + ': no JavaScript page errors', run.pageErrors);
      run.missingUnchangedAssets = sorted(new Set(run.missingUnchangedAssets));
      await json(id + '-run.json', run);
      return run;
    } catch (error) {
      run.error = String(error.stack || error);
      record(false, id + ': browser case completed', run.error);
      await json(id + '-run.json', run);
      return null;
    } finally {
      await context.close();
    }
  }

  function compareRuns(control, candidate) {
    const id = candidate.id, a = control.dom, b = candidate.dom;
    if (!a || !b) { record(false, id + ': complete comparison snapshots'); return; }
    record(a.textContent === b.textContent && a.innerText === b.innerText, id + ': unchanged body text');
    record(same(a.anchors, b.anchors), id + ': every anchor preserved');
    record(same(a.viewport, b.viewport), id + ': unchanged document dimensions', { baseline: a.viewport, candidate: b.viewport });
    const differences = [];
    if (a.elements.length !== b.elements.length) differences.push({ kind: 'element-count', a: a.elements.length, b: b.elements.length });
    for (let i = 0; i < Math.min(a.elements.length, b.elements.length); i++) {
      const left = a.elements[i], right = b.elements[i];
      if (left.tag !== right.tag || left.id !== right.id || left.class !== right.class)
        differences.push({ index: i, kind: 'element-identity', left, right });
      if (left.geometry.some((value, j) => Math.abs(value - right.geometry[j]) > 0.25))
        differences.push({ index: i, kind: 'geometry', tag: left.tag, id: left.id, left: left.geometry, right: right.geometry });
      for (const property of STYLE_PROPS) if (left.styles[property] !== right.styles[property])
        differences.push({ index: i, kind: 'computed-style', property, left: left.styles[property], right: right.styles[property] });
    }
    candidate.comparison = { baseline: control.id, retainedElementCount: a.elements.length,
      geometryToleranceCSSPixels: 0.25, stylePropertyCount: STYLE_PROPS.length, differences };
    record(differences.length === 0, id + ': retained DOM geometry and 30 styles match', differences.slice(0, 30));
    candidate.comparison.screenshotHashesEqual = {
      full: control.screenshots.full.sha256 === candidate.screenshots.full.sha256,
      hero: control.screenshots.hero.sha256 === candidate.screenshots.hero.sha256
    };
    record(same(control.missingUnchangedAssets, candidate.missingUnchangedAssets),
      id + ': missing unchanged assets remain identical', { baseline: control.missingUnchangedAssets, candidate: candidate.missingUnchangedAssets });
  }
}

try { await main(); }
catch (error) {
  failures.push({ label: 'Fatal setup/source/runner gate', details: String(error.stack || error) });
  summary.passed = false;
  if (proofDir) await json('summary.json', summary).catch(() => {});
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
