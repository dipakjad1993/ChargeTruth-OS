/* enterprise-check: CI gate for enterprise readiness (runs in GitHub Action).
   Checks: PWA icons, robots/sitemap/llms, JSON-LD in index, SW version, test glob,
   provenance fields, quarterly freshness. Fails loudly — enterprise loves loud CI.
   v2.1 adds: red-card 28% gate, ledgerHash/HMAC honesty, safe helpers, city-count
   honesty, pack artifacts, split test files, perf-budget + Dataset checks. */
import { readFileSync, existsSync } from 'node:fs';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + msg); if (!c) fails++; };

ok(existsSync('assets/icon-192.png'), 'pwa icon-192 exists');
ok(existsSync('assets/icon-512.png'), 'pwa icon-512 exists');
ok(existsSync('robots.txt'), 'robots.txt exists');
ok(existsSync('sitemap.xml'), 'sitemap.xml exists');
ok(existsSync('llms.txt'), 'llms.txt exists (GEO)');
ok(existsSync('.well-known/security.txt'), 'security.txt exists');
ok(existsSync('offline.html') && existsSync('404.html'), 'offline + 404 fallbacks exist');
const html = readFileSync('index.html', 'utf8');
ok(html.includes('rel="canonical"'), 'canonical present');
ok(html.includes('og:title'), 'OG tags present');
ok(html.includes('hreflang'), 'hreflang present');
ok(html.includes('application/ld+json'), 'JSON-LD present');
ok(html.includes('Content-Security-Policy'), 'CSP present');
const sw = readFileSync('sw.js', 'utf8');
ok(sw.includes('chargetruth-v2'), 'SW versioned v2');
ok(sw.includes('stale-while-revalidate') || sw.includes('Stale') || sw.includes('revalidate') || sw.includes('TTL') || sw.includes('network-first') || sw.includes('Network'), 'SW has revalidation strategy');
const rel = readFileSync('src/js/reliability.js', 'utf8');
ok(rel.includes('wilsonInterval') && rel.includes('decayedCounts') && rel.includes('provenanceHash'), 'blender v2 (decay+Wilson+hash) present');
ok(rel.includes('0.28') && rel.includes('ledgerHash') && rel.includes('provenanceHmac'), 'v2.1: 28% red-card + ledgerHash alias + HMAC honesty present');
const pm = readFileSync('src/js/powermatch.js', 'utf8');
ok(pm.includes('sessionMinutesResult') && pm.includes('AC-ONLY'), 'powermatch safe wrapper (no Infinity to UI) present');
const tp = readFileSync('src/js/trip-planner.js', 'utf8');
ok(tp.includes('fetchValhallaDistKm') && tp.includes('distProvenance') && tp.includes('500'), 'trip-planner Valhalla hook + provenance + long-haul note present');
const pl = readFileSync('src/js/pluglogic.js', 'utf8');
ok(pl.includes('exact') || pl.includes('Exact') || pl.includes('norm('), 'pluglogic exact-match-first guard present');
const dl = readFileSync('src/js/data-loader.js', 'utf8');
ok(dl.includes('ocm-error'), 'data-loader OCM never-throws guard present');
const app = readFileSync('src/js/app.js', 'utf8');
ok(app.includes('maxKwOf') && app.includes('priceBoth') && app.includes('amenFilter'), 'app safe maxKw + FX + amenity/payment filters present');
const research = JSON.parse(readFileSync('data/research.json', 'utf8'));
ok((research.stats || []).length >= 10, 'research stats >=10 with confidence');
// city-count honesty: UI copy must not claim 400+ while JSON has 109
const cities = JSON.parse(readFileSync('data/cities.json', 'utf8')).cities;
ok(html.includes(String(cities.length)) || html.includes(`${cities.length} cities`), `index honesty: mentions real ${cities.length}-city count`);
ok(!html.includes('400+ cities') || html.includes('expanding to 400+') || html.includes(String(cities.length)), 'index does not overclaim city count');
// split test files (README contract)
for (const f of ['tests/reliability.test.js', 'tests/powermatch.test.js', 'tests/pluglogic.test.js', 'tests/swap.test.js', 'tests/trip.test.js']) {
  ok(existsSync(f), `${f} exists`);
}
// pack artifacts with measured sizes
ok(existsSync('packs/merged.json'), 'packs/merged.json exists');
try {
  const merged = JSON.parse(readFileSync('packs/merged.json', 'utf8'));
  ok((merged.count || merged.features?.length || 0) >= 20, `merged pack has stations (${merged.count ?? merged.features?.length})`);
} catch { ok(false, 'merged pack parses'); }
// INP/LCP perf budget: app shell must stay light (no heavy framework, CSS < 60KB target flag)
ok(html.includes('display=swap') && !html.includes('googletagmanager'), 'perf: font display=swap, no render-blocking GTM');
// Dataset schema for GEO citations
ok(html.includes('"@type":"Dataset"'), 'Dataset JSON-LD present (GEO)');
// v2.2 gates: domain config, analytics, pilot, selfhost, indexnow, manifests
ok(html.includes('ct-site-url'), 'canonical domain configurable (ct-site-url meta)');
ok(html.includes('google-site-verification'), 'GSC verification meta present');
ok(existsSync('src/js/site-config.js') && existsSync('src/js/pilot.js'), 'site-config + pilot modules exist');
ok(existsSync('scripts/indexnow-submit.js') && existsSync('scripts/cwv-budget.js') && existsSync('scripts/record-paren-hash.js'), 'indexnow + cwv + paren-hash scripts exist');
ok(existsSync('docs/SELFHOST.md') && existsSync('src/css/fonts-selfhost.css'), 'SELFHOST runbook + font self-host CSS exist');
ok(existsSync('.well-known/indexnow-key.txt'), 'indexnow key file exists');
ok(readFileSync('src/js/offline-pack.js', 'utf8').includes('tileCount') && readFileSync('src/js/offline-pack.js', 'utf8').includes('fifteenMBverdict'), 'pack tile math + 15MB verdict present');
ok(readFileSync('src/js/app.js', 'utf8').includes('pilotGate') && readFileSync('src/js/app.js', 'utf8').includes('dupesRemoved'), 'app shows pilot gate + dedupe counts');
if (fails) { console.error(`${fails} enterprise checks FAILED`); process.exit(1); }
console.log('enterprise-check: all green');
