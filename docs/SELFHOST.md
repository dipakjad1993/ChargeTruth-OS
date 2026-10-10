# SELFHOST — fonts + Valhalla + PMTiles runbook (no Google Tax, CWV-safe)

Updated Oct 2026. Owner: ChargeTruth infra. Budget: LCP <2.5s, INP <200ms, CLS <0.1 field p75 (Moto G4).

## 1. Fonts (kill render-blocking Google CSS)
```powershell
New-Item -ItemType Directory -Force assets/fonts
# Download woff2 (ofl license) into assets/fonts/:
#  plus-jakarta-sans.woff2, roboto-flex.woff2, material-symbols-rounded.woff2
# Then in index.html: DELETE the two fonts.googleapis.com <link> tags.
# src/css/fonts-selfhost.css @font-face takes over (display=swap/block).
# Verify: Lighthouse font-display + "no render-blocking requests" + INP <200ms.
```

## 2. Valhalla (routing, no Directions/Distance Matrix bill)
```powershell
docker run -d --name valhalla -p 8002:8002 -v ./pbf:/data ghcr.io/valhalla/valhalla
# Build tiles: place india-latest.osm.pbf + us-midwest-latest.osm.pbf in ./pbf/, follow Valhalla build docs.
# In app: localStorage valhalla_url = http://localhost:8002/route  (fleet: https://valhalla.yourdomain/route)
# App auto-upgrades straight-line×1.25 to road geometry when reachable, else stays offline.
# trip-planner.js fetchValhallaDistKm() never throws; distProvenance logged per plan.
```

## 3. PMTiles (maps, no Maps JS bill; OSM bulk-scrape forbidden)
```powershell
# Per state: extract z12 bbox from packs/<state>.manifest.json (tileCount/tileMB/totalMBest).
# Generate: pmtiles extract osm-mbtiles.pmtiles state.pmtiles --bbox <minLon,minLat,maxLon,maxLat> --maxzoom 12
# Host: https://tiles.yourdomain/{state}.pmtiles + update offline-pack.js pmtiles URL + CSP img/connect-src.
# Attribution required on every map view: © OpenStreetMap contributors.
```

## 4. CWV gate (CI)
`node scripts/cwv-budget.js` fails on: GTM present, missing display=swap/block, shell >60KB CSS,
no font self-host note, missing field-measurement hookup (CrUX/PSI + GSC CWV report).
Measure field p75 in GSC Core Web Vitals + PageSpeed Insights, not lab Lighthouse alone.
