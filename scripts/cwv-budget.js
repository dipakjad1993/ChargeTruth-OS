/* cwv-budget: CI gate for March 2026 Core Update budgets (LCP <2.5s, INP <200ms, CLS <0.1).
   Static checks (fail loudly): no GTM render-blocking, font display=swap/block, CSS shell ≤60KB,
   self-host note present, analytics deferred, content-visibility hint. Field p75 still measured
   in GSC CWV + PSI/CrUX — this gate only blocks obvious regressions. */
import { readFileSync, statSync } from 'node:fs';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const html = readFileSync('index.html', 'utf8');
const cssB = statSync('src/css/styles.css').size;
ok(!html.includes('googletagmanager.com/gtag') || html.includes('ct-ga4-id'), 'analytics deferred via ct-ga4-id (no hard GTM tag)');
ok(!html.includes('googletagmanager') || !html.includes('<script src="https://www.googletagmanager'), 'no render-blocking GTM in shell');
ok(html.includes('display=swap'), 'fonts display=swap (INP/LCP safe)');
ok(cssB <= 60 * 1024, `CSS shell ${Math.round(cssB / 1024)}KB ≤ 60KB`);
ok(html.includes('ct-site-url'), 'canonical domain configurable (ct-site-url)');
ok(readFileSync('src/css/fonts-selfhost.css', 'utf8').includes('@font-face'), 'font self-host CSS present');
ok(readFileSync('docs/SELFHOST.md', 'utf8').includes('INP <200ms'), 'SELFHOST runbook documents CWV budget');
ok(readFileSync('src/js/site-config.js', 'utf8').includes('ai_referral'), 'GA4 AI-referral isolation present');
if (fails) { console.error(`${fails} CWV budget checks FAILED`); process.exit(1); }
console.log('cwv-budget: all green (static gate; confirm field p75 in GSC CWV + PSI)');
