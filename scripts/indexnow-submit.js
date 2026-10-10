/* indexnow-submit: notify Bing/Yandex/Naver on publish (Google uses sitemap + GSC API instead).
   Usage: INDEXNOW_KEY=xxx SITE_URL=https://yourdomain node scripts/indexnow-submit.js [--urls dist/sitemap-add.xml]
   Setup: 1) put key file at /.well-known/indexnow-key.txt (mirrors INDEXNOW_KEY),
   2) run after prerender-seo.js in CI. No-ops safely on placeholder example.com. */
import { readFileSync, existsSync } from 'node:fs';
const site = (process.env.SITE_URL || 'https://chargetruth.example.com').replace(/\/$/, '');
const key = process.env.INDEXNOW_KEY || '';
if (site.includes('example.com')) {
  console.log('indexnow: SKIP — set SITE_URL to real domain first (see src/js/site-config.js).');
  process.exit(0);
}
if (!key) {
  console.log('indexnow: SKIP — set INDEXNOW_KEY secret + /.well-known/indexnow-key.txt.');
  process.exit(0);
}
let urls = [];
for (const f of ['dist/sitemap-add.xml', 'sitemap.xml']) {
  try {
    if (existsSync(f)) {
      const xml = readFileSync(f, 'utf8');
      urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    }
  } catch {}
}
urls = [...new Set(urls)].filter((u) => u.startsWith(site)).slice(0, 10000);
console.log(`indexnow: submitting ${urls.length} URLs for ${site}`);
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/.well-known/indexnow-key.txt`, urlList: urls.slice(0, 1000) })
});
console.log('indexnow:', res.status);
if (!res.ok) process.exit(1);
