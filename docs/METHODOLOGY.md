# METHODOLOGY — how every number is computed (no black box)

Authors: ChargeTruth data team. Reviewed per Razorfish enterprise SEO methodology (E-E-A-T). Updated Oct 10, 2026. Next refresh Jan 2026.

## 1. Reliability Score 0–100 (Uptime Blender v2.0)

```
Score = 100 × (0.45×crowd + 0.25×cpoPrior + 0.20×size + 0.10×freshness) − penalties
crowd = decay-weighted ok/(ok+fail), half-life 10d, fraud-adjusted, Wilson 95% CI shown
```

| Input | Math (v2) | Why |
|---|---|---|
| crowd | Exponential decay (hl=10d) + per-device cap 3/day + Wilson 95% lower-bound display | Day-29 report ≠ day-1; bursts down-weighted; thin samples show wide CI |
| cpoPrior | Per-CPO table (`data/cpo.json`). Assure 0.98 **only if** `assure=true AND stalls≥6` | Brand averages lie; SLA + redundancy required together |
| size | 12+→0.97, 8+Assure→0.98, 6+Assure→0.96, 4→0.84, 2→0.74, 1→0.55 | P(all stalls down) ≈ (1−p)^n. Single stall = fragile by construction |
| freshness | ≥100 reports→1.0, ≥40→0.92, ≥15→0.8, ≥5→0.65, else 0.45 + low-confidence flag | Thin data leans on prior, visibly |
| connector | Worst-plug (n≥5) fail≥30% → −8, ≥20% → −4 | EA dispenser #3 fails ≠ whole site |
| penalties | raw fail ≥28% (n≥10) → −12 + RED CARD; ≥20% → −6; 1-stall & fail≥25% → −5; borderline ≥25% + HIGH queue → RED CARD (queue-escalated) | Red card is deterministic and appealable with new reports. v2.1 threshold 28% (was 30%) — EA Dearborn 29.7% now correctly red-cards |

Queue risk is **separate** (low/med/high + p50/p90 mins) — never silently folded into Score.
Every score emits `{score, grade, wilson CI, trust, provenance, ledgerHash (alias provenanceHash), updated, nextRefresh}`.
FNV-1a `ledgerHash` is a tamper-evidence checksum for offline packs; SLA/billing dashboards must use async `provenanceHmac(obj, secret)` (HMAC-SHA256 via WebCrypto).

## 2. Power-match (real kW, real minutes)

`actualKw = min(stationKw, vehicleCurve(SoC), adapterCap, ampCap(V×I)) × tempDerate × preconditionBonus × sharedDerate`

- Curve integrated in 2% SoC steps over `vehicles.json` curves (e.g. Tiago 25kW flat, EGMP 230kW to 50% then taper).
- `tempDerate`: ≤−15°C→0.5, −5→0.65, 0→0.8, ≥45→0.8, ≥40→0.9. Preconditioned +15% when ≤5°C.
- Amp guard: `P = V_vehicle × min(I_station, I_vehicle)` — 800V stall on 400V car caps correctly.
- Shared-power: sites ≥4 stalls at >60% occupancy ×0.85.
- Session = Σ(stepKwh/avgKw)×60 + 3 min overhead (auth/plug/ramp).
- Hype flag when `stationKw > 1.5× vehiclePeak` → "you pay for electrons, not headlines".
- AC vs DC shown separately, never summed.

## 3. Plug logic

Native DC > native AC fallback > adapter matrix > HARD STOP. Voltage-class guard:
Bharat DC-001 (48–72V) ≠ CCS2 (400V) — name match alone insufficient. No CHAdeMO↔CCS
DC adapter exists (correctly reported impossible, not "coming soon").
Bug fix v2: `BharatDC001-car` is its own key (was `CCS-car`).

## 4. Swap availability heuristic v2

`avail = crowdBase × rushDerate × dockBuffer`, rush from `swap-networks.json`
(Sun 0.5× at lunch/dinner, Gogoro 0.55×, Ola 0.6× at commute peaks…).
v2 adds weekend/holiday/rain derates + p50/p90 wait mins.
Physical fit enforced: Sun≠Gogoro≠Ola; NIO+Geely Sept-2026 = app merge, separate lanes +5 min.

## 5. Trip planner (Valhalla-ready, offline-first)

Haversine ×1.25 circuity offline; real Valhalla `valhallaDistKm` when reachable + elevation gain.
Consumption factor: temp (up to 1.38× at −10°C), cargo (+5%/100kg, cap 25%),
speed (1.22× at 110+), rain 1.08×, headwind 1.06×, elevation climb physics, preconditioning −6%.
Reserve: 15% ≤0°C else 10%.
Picks **2 optimal** corridor stops (≤25km detour) by score−detour−failRate, never arrival < reserve.

## 6. Live vs offline (hybrid truth — there is no 100% real-time offline)

- Live (online): OCPI 2.2.1 > NREL AFDC > OCM live, 5-min TTL, stale-while-revalidate.
- Offline: OSM dump + OCM quarterly dump + crowd, versioned packs (90-day TTL, OPFS).
- Pipeline: ingest → normalize (grid+H3) → dedupe (500m+plug+kW fuzzy, `scripts/dedupe-pipeline.js`) → enrich → score → publish pack + sitemap.

## 7. What "verified" means here

- **Verified**: connector pinouts, vehicle peaks (OEM sheets), OCM/Paren/JDP stats as cited with confidence + hash.
- **Heuristic**: rush derates, CPO priors for thin-data sites, fleet 90-min/25-min figures (pilot-gated).
- **Must re-verify quarterly**: Paren ports, NACS share, Assure SLA list, NIO+Geely cabin counts. See VERIFICATION.md.
