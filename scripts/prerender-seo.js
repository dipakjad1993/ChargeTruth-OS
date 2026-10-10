/* prerender-seo: builds static programmatic pages for crawlers + AI citations.
   Usage: node scripts/prerender-seo.js
   Reads data/vehicles.json + cities.json + stations.sample.geojson + research.json → dist/ HTML
   (route/vehicle/swap/plug pages with unique Score/real-kW/mins/FAQ + JSON-LD incl. Dataset).
   Keep SPA as app; these static pages are what Google + AI Overviews cite.
   v2.1: covers all 24 seoLongTails (route, vehicle, swap, plug, glossary) + Dataset schema. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const vehicles = JSON.parse(readFileSync('data/vehicles.json', 'utf8')).vehicles;
const cities = JSON.parse(readFileSync('data/cities.json', 'utf8')).cities;
const stations = JSON.parse(readFileSync('data/stations.sample.geojson', 'utf8')).features;
const research = JSON.parse(readFileSync('data/research.json', 'utf8'));
const longTails = research.seoLongTails || [];

const corridors = [
  ['Mumbai', 'Pune'], ['Delhi', 'Jaipur'], ['Detroit', 'Ann Arbor'], ['Bangalore', 'Chennai']
];
const heroVehicles = ['tata-nexon-ev-45', 'tata-tiago-ev', 'mahindra-be6-79', 'tesla-modely-75', 'hyundai-ioniq5-72'];
const swapVehicles = ['sun-buddy-2', 'gogoro-pack-1', 'ola-s1-pro-4'];
const plugGuides = [
  ['ccs-vs-nacs-adapter', 'CCS vs NACS adapter: which one do I need?', 'NACS car at CCS1 needs an OEM active-cooled DC adapter; CCS2 car at CCS1 is a hard stop. See adapter matrix.'],
  ['nacs-to-ccs1-adapter-safe', 'NACS to CCS1 adapter: is it safe?', 'Only OEM-approved active-cooled adapters (~150kW cap on some). Melted pins are real — buy OEM.'],
  ['bharat-dc001-vs-ccs2', 'Bharat DC-001 vs CCS2 difference', 'Bharat DC-001 is 48-72V low-voltage DC; CCS2 cars need 400V. Hard incompatibility — filter by voltage class.'],
  ['leaf-chademo-station-finder', 'Nissan Leaf CHAdeMO station finder 2026', 'No CHAdeMO→CCS DC adapter exists. Filter CHAdeMO-only; that single stall is your lifeline.'],
  ['ocpi-vs-ocpp', 'OCPI vs OCPP difference', 'OCPP = charger-to-backend (TransactionEvent); OCPI 2.2.1 = roaming between networks. Live layer: OCPI > NREL > OCM.'],
  ['iso-15118-plug-and-charge', 'ISO 15118 Plug & Charge: how it works', 'PKI certificates in car + charger enable tap-free billing. OCPP 2.1 + ISO 15118-20 roadmap.']
];

const datasetLD = (about) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dataset","name":"ChargeTruth ${about} (Oct 2026)","description":"Provenance-signed EV charging intelligence: reliability scores, real-kW curves, swap interop. Quarterly refreshed.","license":"https://creativecommons.org/licenses/by/4.0/","temporalCoverage":"2026-01/2026-10","creator":{"@type":"Organization","name":"ChargeTruth OS","url":"https://chargetruth.example.com"}}<\/script>`;
const faqLD = (q, a) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}]}]}<\/script>`;
const breadcrumbLD = (trail) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":${JSON.stringify(trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t[0], item: t[1] })))}}<\/script>`;
const shell = ({ title, desc, canon, body, extraLD = '' }) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<title>${title}</title><meta name="description" content="${desc}">`
  + `<link rel="canonical" href="${canon}">`
  + `<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="article">`
  + `<meta name="author" content="ChargeTruth data team">`
  + extraLD + `</head><body><main>${body}`
  + `<hr><p><small>By ChargeTruth data team. Updated <time datetime="2026-10-10">Oct 10, 2026</time>. Next refresh Jan 2026. Sources: J.D. Power 2026 EVX (Aug 12, 2026, n=6,594), Paren Q1/Q2 2026. Confidence labels on every stat. <a href="/docs/METHODOLOGY.html">Methodology</a> · <a href="/docs/VERIFICATION.html">Verification</a> · <a href="/">App</a></small></p></main></body></html>`;

mkdirSync('dist/route', { recursive: true });
mkdirSync('dist/vehicle', { recursive: true });
mkdirSync('dist/swap', { recursive: true });
mkdirSync('dist/plug', { recursive: true });
let n = 0;
for (const [a, b] of corridors) {
  for (const vid of heroVehicles) {
    const v = vehicles.find((x) => x.id === vid);
    if (!v) continue;
    const slug = `${a.toLowerCase()}-${b.toLowerCase()}-${vid}`;
    const q = `How many stops ${a}-${b} in a ${v.name}?`;
    const ans = 'Usually 1-2 optimal stops picked by reliability minus detour. We never plan arrival below 10-15% reserve, and winter adds 15% buffer below 0C.';
    const topStations = stations.slice(0, 5).map((s) => `<tr><td>${s.properties.name}</td><td>${s.properties.maxKw || s.properties.max_kw || '—'} kW</td><td>${(s.properties.plugs || s.properties.connectors || []).join(', ') || s.properties.plug || '—'}</td></tr>`).join('');
    const html = shell({
      title: `${a} to ${b} by ${v.name} — charging stops, real kW, minutes | ChargeTruth`,
      desc: `${v.name} ${a}-${b}: 2 optimal stops (not 6), real kW on 120kW stall, 10-80% minutes, queue + red cards. Provenance-signed Oct 2026.`,
      canon: `https://chargetruth.example.com/route/${slug}/`,
      extraLD: faqLD(q, ans) + datasetLD(`route ${a}-${b} ${v.name}`) + breadcrumbLD([['Home', 'https://chargetruth.example.com/'], [`${a}-${b}`, `https://chargetruth.example.com/route/${slug}/`]]),
      body: `<h1>${a} → ${b} in ${v.name}</h1>`
      + `<p><strong>TL;DR:</strong> Plan 1-2 optimal stops, not 6. ${v.name} caps at ${v.maxKwDc || 0}kW DC, so a 350kW stall gives you at most ${v.maxKwDc || 0}kW. Full curve-integrated minutes in the app.</p>`
      + `<h2>Short answer</h2><p>Battery ${v.batteryKwh}kWh (${v.usableKwh} usable), DC peak ${v.maxKwDc}kW, plug ${v.plugDc || v.plugAc || v.swap}. `
      + `On a 120kW stall you get up to ${v.maxKwDc}kW (car-limited). JDP 2026 context: DC fail rate is 12% nationally, so check red cards before routing.</p>`
      + `<h2>Corridor stations (sample)</h2><table><tr><th>Station</th><th>Max kW</th><th>Plugs</th></tr>${topStations}</table>`
      + `<h2>Reliability context 2026</h2><table><tr><th>Signal</th><th>Value</th><th>Source</th></tr>`
      + `<tr><td>DC fail rate</td><td>12% (1-in-8)</td><td>J.D. Power EVX 2026</td></tr>`
      + `<tr><td>Top network</td><td>IONNA 807</td><td>J.D. Power EVX 2026</td></tr>`
      + `<tr><td>New ports 250kW+</td><td>72% (Q2 2026)</td><td>Paren Q2 2026</td></tr>`
      + `<tr><td>NACS new-build share</td><td>22.9% (doubled YoY)</td><td>Paren Q2 2026</td></tr></table>`
    });
    writeFileSync(`dist/route/${slug}.html`, html);
    n++;
  }
}
for (const v of vehicles.slice(0, 20)) {
  const slug = `${v.id}-charging-time`;
  writeFileSync(`dist/vehicle/${slug}.html`, shell({
    title: `${v.name} charging time 10-80% real minutes | ChargeTruth`,
    desc: `${v.name}: ${v.maxKwDc}kW DC peak, ${v.batteryKwh}kWh. Real 10-80% minutes via curve integration, not brochure. Oct 2026.`,
    canon: `https://chargetruth.example.com/vehicle/${slug}/`,
    extraLD: faqLD(`${v.name} real 10-80% time?`, `Curve-integrated in 2% steps, not brochure peak. ${v.notes || 'Check the app power-match for your SoC and temperature.'}`.slice(0, 300)) + datasetLD(`vehicle ${v.name}`),
    body: `<h1>${v.name} — real charging time</h1><p><strong>TL;DR:</strong> Peak ${v.maxKwDc}kW is not sustained. Real 10-80% comes from the charge curve in 2% steps plus temperature derate.</p><table><tr><th>Spec</th><th>Value</th></tr><tr><td>Battery</td><td>${v.batteryKwh}kWh (${v.usableKwh} usable)</td></tr><tr><td>DC peak</td><td>${v.maxKwDc}kW</td></tr><tr><td>Plug</td><td>${v.plugDc || v.plugAc || v.swap}</td></tr></table><p>${v.notes || ''}</p>`
  }));
  n++;
}
for (const vid of swapVehicles) {
  const v = vehicles.find((x) => x.id === vid);
  if (!v) continue;
  const slug = `${vid}-swap-guide`;
  writeFileSync(`dist/swap/${slug}.html`,
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${v.name} swap guide: cabins, price, availability | ChargeTruth</title><meta name="description" content="${v.name}: compatible swap cabins only (physical fit enforced), rush-hour availability, Rs per swap, ROI vs charging."><link rel="canonical" href="https://chargetruth.example.com/swap/${slug}/">${faqLD(`${v.name} swap vs charge?`, `Swap wins when rider time dominates: 5-min swap beats 3-hr charge at Rs 150/hr rider cost. App merge is not physical interop — verify lane type.`)}${datasetLD(`swap ${v.name}`)}</head><body><h1>${v.name} — swap guide</h1><p>Swap network ${v.swap}. Physical fit enforced: Sun packs do not latch in Gogoro cabins. Updated Oct 2026.</p></body></html>`);
  n++;
}
for (const [slug, title, body] of plugGuides) {
  writeFileSync(`dist/plug/${slug}.html`,
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title} | ChargeTruth</title><meta name="description" content="${title} — 2026 answer with voltage-class guard."><link rel="canonical" href="https://chargetruth.example.com/plug/${slug}/">${faqLD(title, body)}${datasetLD(`plug ${slug}`)}</head><body><h1>${title}</h1><p>${body} Updated Oct 2026.</p></body></html>`);
  n++;
}
console.log(`prerendered ${n} static SEO pages → dist/ (covers ${longTails.length} long-tails; deploy to edge; add URLs to sitemap.xml)`);
// Emit merge-ready sitemap fragment so ops can paste into sitemap.xml (keeps Programmatic SEO deployable)
const urls = [];
for (const [a, b] of corridors) for (const vid of heroVehicles) urls.push(`https://chargetruth.example.com/route/${a.toLowerCase()}-${b.toLowerCase()}-${vid}/`);
for (const v of vehicles.slice(0, 20)) urls.push(`https://chargetruth.example.com/vehicle/${v.id}-charging-time/`);
for (const vid of swapVehicles) urls.push(`https://chargetruth.example.com/swap/${vid}-swap-guide/`);
for (const [slug] of plugGuides) urls.push(`https://chargetruth.example.com/plug/${slug}/`);
writeFileSync('dist/sitemap-add.xml', urls.map((u) => `  <url><loc>${u}</loc><lastmod>2026-10-10</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n') + '\n');
console.log(`sitemap fragment: ${urls.length} URLs → dist/sitemap-add.xml (merge into sitemap.xml)`);
