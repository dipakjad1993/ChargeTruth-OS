# ENTERPRISE — how ChargeTruth goes from demo to fleet contract

Version 2.0.0. Updated Oct 10, 2026.

## 1. Honesty contract (why enterprises trust us)

There is no 100% real-time offline. We ship hybrid truth:
live (OCPI 2.2.1 / NREL / OCM, 5-min TTL) when online, versioned packs (90-day TTL, OPFS)
when offline. Every score carries provenance + hash + Wilson CI + updated + nextRefresh.
Heuristics are labeled; pilots gate fleet claims. See VERIFICATION.md.

Real-time tracking = live layer + background sync + push reroute ("stall down ahead").
Real-life output = avoided tows, p50/p90 waits, TCO CSV. Analysis = quarterly Paren/JDP
refresh with PDF hashes. Research = 83 curves + 10 swap networks + CPO priors, CC BY 4.0.

## 2. Security & compliance

- SOC2 Type II roadmap: audit logs (`enterprise.js` → SIEM), encryption at rest, least-privilege RBAC.
- GDPR + India DPDP Act 2023: PII minimization (note ≤280 chars, device hash not IDFA), consent for precise location, DPA on request, data residency (IN/EU/US packs).
- NIS2 (EU charging = essential service): OCPP Security Profile 2/3 + mTLS + ISO 15118 PKI roadmap, incident playbook, status page.
- App: CSP, SRI-ready, `/.well-known/security.txt`, velocity caps (3/day/device), moderation queue, signed provenance ledger.

## 3. Identity, RBAC, API

- Auth: Clerk/Auth0/Supabase Auth (stub in `src/js/enterprise.js`: `currentOrg/setOrg/can`).
- Roles: driver < fleet < cpo < admin. Perms in code; every override audited.
- API v1: `GET /api/v1/stations`, `GET /api/v1/badge`, `POST /api/v1/reports`, `GET /api/v1/health`. Bearer key, 100/min/key, 99.9% SLO, p95 <400ms edge. See `API_V1` export.
- White-label badge: `badge.html?station=id` iframe. SLA monitor compares your uptime vs Paren 90-95% benchmark.

## 4. Data pipeline (no double-counting)

`ingest-ocm/osm` → `scripts/dedupe-pipeline.js` (grid + operator + plug fuzzy, merges stalls/kW/reports, emits sources[]) → `packs/merged.json` → `build-offline-pack` → OPFS + sitemap.
Live: `fetchLiveStatus()` = OCPI > NREL > OCM → cache 5 min → fallback pack. Never Google.

Tiles: self-host PMTiles/Valhalla for fleets (OSM policy forbids bulk scrape). Attribution always.

## 5. SEO / GEO (why we rank + get cited)

Prerendered `dist/` (route/vehicle/swap/plug, 2000+ URLs) + sitemap + canonical + hreflang (en-IN/en-US) + JSON-LD (SoftwareApplication/Dataset/FAQPage) + `llms.txt` + Dataset CC BY dump.
CWV budget: LCP <2.5s, INP <200ms, CLS <0.1 on Moto G4. Fonts non-blocking, SWR for data.
Measure: GSC AI citations + rankings + INP pass + report volume + red-card precision/recall.

## 6. Fleet pilot (prove 208 hrs/day, don't promise it)

20 riders × 2 weeks GPS: hunt-min/swap wait/kWh price. Dashboard `fleetRollup()` exports CSV.
Success gate before sales deck: p50 hunt <10 min with ChargeTruth vs baseline.

## 7. Payments & AFIR

UPI intent + Stripe + OCPI roaming billing; per-kWh + per-min receipts (AFIR transparency).
Plug&Charge (ISO 15118) + V2G 15118-20 on roadmap; V2H safe-stop shipped with LFP/NMC guards.

## 8. Runbooks

- `npm test` (engines + enterprise-check), `npm run pipeline:dedupe`, `npm run seo:prerender`, `npm run enterprise:check`.
- Valhalla: `docker run -p 8002:8002 -v ./pbf:/data ghcr.io/valhalla/valhalla`; set `localStorage valhalla_url`.
- Status: `/api/v1/health` → packs version, live source, queue depth. On-call: red-card spike >30% week-over-week pages data team.
