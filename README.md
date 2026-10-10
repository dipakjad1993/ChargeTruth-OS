# ChargeTruth OS — Don't navigate to hope. Navigate to electrons.

[![Live Demo](https://img.shields.io/badge/demo-GitHub_Pages-2ea043?style=flat-square)](https://dipakjad1993.github.io/ChargeTruth-OS/)
[![PWA](https://img.shields.io/badge/PWA-offline--first-blue?style=flat-square)](./manifest.webmanifest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/dipakjad1993/ChargeTruth-OS?style=flat-square)](https://github.com/dipakjad1993/ChargeTruth-OS/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/dipakjad1993/ChargeTruth-OS/ingest-quarterly.yml?style=flat-square&label=quarterly-ingest)](https://github.com/dipakjad1993/ChargeTruth-OS/actions)

> **🔴 Live demo:** https://dipakjad1993.github.io/ChargeTruth-OS/ — install as PWA for offline use. Zero build, zero API key.

> Charger Reliability + Swap Interop Navigator. **No Google Tax. Offline-first. 4W plug-in + 2W/3W swap.**

PlugShare tells you a charger EXISTS. ChargeTruth tells you if it **WORKS**, if your **plug FITS**, and if you'll get **250 kW or 22 kW of sadness**.

## Why this exists (verified research base)

| Claim | Source | What it really means | Confidence |
|---|---|---|---|
| ChargePoint logged ~100M sessions in 2025, +34% YoY, utilization +20% outpacing new ports | ChargePoint 2025 recap reporting | More queuing + broken-stall exposure. Reliability > dot-on-map. | High — vendor-reported, directionally solid |
| Paren Q2 2026 US: only 4,382 new ports (−10% YoY), utilization 15.76%, 72% of new ports 250 kW+, NACS 22.9% (doubled), CCS 70.8% | Paren Motor Finance / quarterly tracker (as cited by user) | Your car may max at 80 kW — 350 kW hype is irrelevant. NACS car at CCS-only site = dead without adapter. | Medium-High — treat as quarterly snapshot, re-verify each quarter |
| J.D. Power 2026: #1 frustration = non-functioning stations | J.D. Power U.S. EV Experience Ownership Study 2026 | Reliability math is the money feature, not more pins. | High (directional) |
| India/SEA alphabet soup: Bharat DC-001 vs CCS2 vs Type 6 vs Gogoro vs Sun Mobility vs Ola Hypercharger | Industry spec sheets + CPO sites | Delivery rider wastes ~90 min/day hunting working swap without interop map | Medium — field heuristic, fleet interviews needed per city |

> **Honesty contract:** there is no such thing as "100% verified real-time" offline data. This repo implements a **truth pipeline**: OSM dump + OpenChargeMap quarterly dump + crowd reports + power/size heuristic, blended into a 0–100 score with visible provenance. When online it can hit OCM live; when offline it uses the cached pack. Every score shows *why*.

## Quick start (no build, no API key)

```powershell
# Option 1: Python (already installed)
python -m http.server 5173 --directory C:\PlugShare
# open http://localhost:5173/

# Option 2: Node
npx serve -l 5173 C:\PlugShare
```

Open `index.html`. Install as PWA for offline. Download a state pack before Western Ghats / Michigan winter runs.

## Data honesty (read before piloting)

- **Cities:** 109 in `data/cities.json` today (Mumbai default route works offline). 400+ is the target — tracked in `docs/VERIFICATION.md` #13.
- **Stations:** 24 in the sample pack (measured sizes below). Production = `ingest-ocm` + `ingest-osm` → `dedupe-pipeline` → `build-offline-pack`. No synthetic stations are presented as live; every score shows provenance + hash + updated + nextRefresh.
- **Measured pack sizes (v2.1, CI-built Oct 2026):**

| Pack | Stations | JSON | Note |
|---|---|---|---|
| Maharashtra `packs/mh.json` (Mumbai–Pune + KA slice) | 12 | ~5 KB | Sample slice; tiles (z12 PMTiles bbox) cached separately toward 15 MB/state target |
| Michigan `packs/mi.json` (Detroit–Ann Arbor–Toledo–Lansing) | 5 | ~3 KB | Sample slice; same tile note |
| Full sample `packs/merged.json` (CI dedupe artifact) | 24 | ~18 KB | 0 dupes removed — proves pipeline runs; real OCM/OSM inputs will show dedupe counts |

> **MEASURED Oct 2026 (build-offline-pack v2.2, z12 × ~45KB/tile): MH bbox (Mumbai–Pune + KA slice) = 4,389 tiles ≈ 192.9 MB → EXCEEDS 15MB. MI corridor = 289 tiles ≈ 12.7 MB → WITHIN target.** 15 MB/state is corridor-bbox-dependent, NOT guaranteed. Shrink MH bbox (split Mumbai–Pune vs KA) or drop to z11/vector before promising. Packs tab + `packs/*.manifest.json` show live verdict per build. Never quote 15MB in sales without the manifest.
> CPO priors v2.1: IONNA 0.97 / Mercedes 0.96 / Rivian 0.93 added from JDP EVX 2026 (807/797/755 vs 666 segment). Paren Q2 2026 ingested as trend (NACS 22.9% new vs 8.0% base).

## Live vs offline modes

- **Offline-only (default, zero keys):** scores from quarterly dumps + crowd `localStorage`. Provenance reads `Offline pack (quarterly dump + crowd)`. Fully working, no backend.
- **Live (fleet/CPO):** set keys and redeploy — `OCM_KEY` for quarterly ingest cron (`.github/workflows/ingest-quarterly.yml`), and in-app `localStorage` `ct-supabase-url/key` (crowd sync), `ct-valhalla-url` (road geometry), NREL/OCPI keys for `fetchLiveStatus()` (5-min TTL). Without keys the app stays offline-first by design, never fake-live.

## Repo map

```
index.html                  → PWA shell + all 7 tabs
manifest.webmanifest / sw.js → offline install + tile/station caching
src/css/styles.css          → full design system
src/js/
  data-loader.js            → loads data/*.json, OCM live w/ fallback
  media.js                  → OEM links + Commons photos + free map-link schemes (new v2.2)
  gazetteer.js              → local OSM city search (no autocomplete API)
  reliability.js            → 0–100 Uptime Blender (the money feature)
  powermatch.js             → real session time via charging curves
  pluglogic.js              → CCS1/CCS2/NACS/CHAdeMO/GB-T/Type6/Bharat matrix
  swap.js                   → Gogoro/Sun/CATL/NIO/Geely-Yiyi/Ola + ROI
  trip-planner.js           → offline elevation+temp+load aware planner
  v2h.js                    → V2H/V2G safe-stop
  reports.js                → 1-tap working/broken/queue (localStorage + Supabase/D1 sync stub)
  offline-pack.js           → 15 MB state pack builder/reader
  app.js                    → wires all tabs + renders outputs
data/
  vehicles.json             → 154 vehicles (IN/US/EU/CN/SEA): max kW, plug, curve, swap compat, official OEM page link (143/154 HEAD-verified Oct 2026, rest flagged), Commons photo lookup
  v2h-batteries.json        → 8 buyable home batteries (Powerwall 3, FranklinWH, EcoFlow, BLUETTI, Anker, Enphase, LG, Generac) with official buy/info URLs
  plugs.json                → connector bible + adapter warnings
  swap-networks.json        → swap networks + pricing + rush heuristics
  cpo.json                  → CPO reliability priors (incl. ChargePoint Assure 98%)
  cities.json               → 109-city offline gazetteer (India+US+SEA; expanding to 400+ — see VERIFICATION.md #13)
  stations.sample.geojson   → 24-station demo corridor (Mumbai–Pune, Delhi–Jaipur, Detroit–Ann Arbor, Bangalore) incl. 2 decay/connector demo stations:
    EA Dearborn (recent fails + failing CCS1 dispenser → RED card 46/D, proves 28% threshold + worst-plug penalty),
    Khandala (stale 29-day-old fails decayed → 54/D no red, proves exponential forgiveness)
  research.json             → sourced stats + caveats + SEO long-tails
scripts/
  ingest-ocm.js             → fetch OpenChargeMap dump → normalized stations
  ingest-osm.js             → parse OSM .pbf/.osm charging tags → normalized stations
  build-offline-pack.js     → builds 15 MB state pack (stations + tiles manifest + gazetteer slice)
tests/
  reliability.test.js / powermatch.test.js / pluglogic.test.js / swap.test.js / trip.test.js (engines.test.js kept as compat aggregator)
docs/
  METHODOLOGY.md            → scoring math, fully documented
  VERIFICATION.md           → what is verified vs heuristic vs needs re-check
  NO-GOOGLE-TAX.md          → cost math: why not Google Maps Platform
  SEO.md                    → long-tail plan
```

## Core outputs (what the user sees)

1. **Route with 2 optimal stops (not 6)** — each with Score, kW you'll ACTUALLY get, mins to add, queue risk, price/kWh, **plus exact GPS coords + Google Maps / OSM / street-photo links** so you reach the real stall, not a same-name station across town.
2. **Vehicle picker with 154 worldwide models** (grouped by market) — selecting one shows a real photo (Wikimedia Commons, credited) + the **official OEM model page link**. No hotlinked OEM images (they bot-block and rot); no invented URLs (143/154 HEAD-verified, rest flagged `unverified`).
3. **V2H tab with buyable batteries** — 8 home batteries (Powerwall 3, FranklinWH aPower 2, EcoFlow DELTA Pro Ultra, BLUETTI EP900, Anker Solix F3800, Enphase 5P, LG Home 8, Generac PWRcell 2) with specs, indicative pricing, and official buy/info URLs. No affiliates.
4. **Red card:** "Avoid this station — 34% fail rate last 30d."
5. **Swap plan for 2W:** "Swap at Station #4 and #9, 4 mins total, Rs 156."
6. **Offline pack download:** 15 MB for the entire state.

## Business impact (modeled, not promised)

- Driver: ~1.5 hrs saved per long trip + 1 avoided tow (~$200 US / ₹15k India).
- Delivery fleet: 25 min/rider/day × 500 riders = ~208 hrs/day. That's headcount.
- CPOs: white-label reliability badge → modeled +18% sessions (pilot required; Paren's 2026 mantra is "operations, customer experience, profitability").

## No Google Tax

Local OSM gazetteer (no Places Autocomplete), Valhalla + OSM .pbf routing abstraction (no Directions/Distance Matrix billing), OSM tiles cached in PWA (no Maps JS bill), crowd via free Supabase / Cloudflare D1. **Station "Google Maps ↗" links are free `maps/search` URL schemes, not billable Maps Platform API calls** — the $0-marginal claim stands. See `docs/NO-GOOGLE-TAX.md` for the $15k-before-10k-users math.

## Safety note

Michigan winter at 10% SoC with kids is not a UX issue — it's a tow truck. The planner reserves a winter buffer (+15% SoC floor below 0 °C) and never plans arrival <10% (configurable to 15–20% with cargo/cold).

## Deploy your own (free)

GitHub Pages (this repo's live demo) serves the static root directly — no build step:

1. Fork this repo → Settings → Pages → Deploy from branch `main` / `/ (root)`.
2. Open `https://<you>.github.io/ChargeTruth-OS/` and install as PWA.
3. Optional live keys (fleet/CPO): set `OCM_KEY` repo secret for the quarterly ingest cron, and in-app `localStorage` keys `ct-supabase-url/key` (crowd sync), `ct-valhalla-url` (road geometry). Without keys the app stays offline-first by design.

See `docs/SELFHOST.md` for Valhalla self-host + tile caching.

## Contributing

PRs welcome — especially per-city fleet verification (see `docs/VERIFICATION.md` #13), new vehicle charge curves (`data/vehicles.json`), and swap-network coverage (`data/swap-networks.json`). Run `npm test` before pushing.

## License

MIT — see [LICENSE](./LICENSE).
