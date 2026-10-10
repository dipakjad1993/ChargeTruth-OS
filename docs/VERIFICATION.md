# VERIFICATION — what is solid, what is snapshot, what needs a pilot

Updated Oct 10, 2026. Next refresh Jan 2026. Owner: ChargeTruth data team.

| # | Claim in app | Status (Oct 2026 refresh) | Action |
|---|---|---|---|
| 1 | ChargePoint 100M sessions / +34% / +20% util | Vendor-reported 2025 recap — directional HIGH | Link investor recap; refresh yearly |
| 2 | Paren Q1 2026 US: 3,387 ports, 73,394 total, 15.6% util, 55-67% 250kW+, NACS 606 new (21%) vs CCS1 2,102, base 8% NACS | Real-time 95% DCFC coverage HIGH — canonical | Store PDF hash `paren-q1-2026-us`; pull Q2/Q3 on release |
| 3 | Paren Q2 2026: 806 stations / 4,382 ports, 15.76% util, 72% 250kW+, NACS 22.9% doubled, CCS 70.8%, base 74.6% CCS / 8.0% NACS | Free quarterly report HIGH — trend inductor | Store PDF hash; pull Q3 on release; base-vs-new gap drives adapter UX |
| 3b | JDP 2026 ranks: IONNA 807 / Mercedes 797 / Rivian 755 / Tesla 701 / DC 666 / L2 595; CPO priors 0.97/0.96/0.93 | Study HIGH (Aug 12 2026, n=6,594) — priors normalized, re-verify yearly | Priors live in data/cpo.json v2.1.0; charts in assets/chart-*.svg |
| 4 | J.D. Power 2026 EVX: 12% fail all-time low, IONNA highest, DC up / L2 down | Study HIGH (Aug 12 2026) | Link study page; add amenity/payment filters |
| 5 | Assure ≈98% | Program SLA, site variance MEDIUM | Only apply prior when `assure=true` tagged per-site |
| 6 | NIO+Geely/Yiyi merged Sept 2026 | News MEDIUM — needs URL + cabin audit | Do not claim merged coverage count until audited |
| 7 | Rider 90 min/day hunt; fleet 25 min×500=208h | Field heuristic LOW-MEDIUM | 2-week GPS pilot, 20 riders, before sales deck |
| 8 | CPO +18% sessions from badge | Modeled, NOT measured | Pilot with 1 CPO, A/B, 90 days |
| 9 | Vehicle peaks/curves (83 models) | OEM sheets HIGH, software-locks vary | Re-check yearly; surface "verify VIN plate" |
| 10 | Swap prices Rs 55–80 / $11–14.5 | Indicative Oct 2026 MEDIUM | Per-city re-verify; tariff editable in UI |
| 11 | 15MB/state pack | MEASURED Oct 2026: MH 4,389 z12 tiles ≈192.9MB EXCEEDS; MI 289 tiles ≈12.7MB WITHIN. Target is bbox-dependent, not guaranteed | Split MH bbox or z11/vector; cite packs/*.manifest.json per build, never flat 15MB |
| 12 | March 2026 Core Update / AI Overviews 48% / zero-click 58.5% | Industry HIGH (Moz/Seer/Dataslayer) | GSC AI reports monthly; prerendered pages for citations |
| 13 | 109-city gazetteer (README previously said 400+) | Code-counted 109 (Oct 2026) — CORRECTED v2.1 | Expand to 400+ from OSM/GeoNames or keep honest 109-count in all UI/SEO copy |
| 14 | Red-card threshold 28% + queue-escalation (was 30%) | Code v2.1 HIGH — EA Dearborn 29.7% now red-cards | Keep threshold + escalation covered by tests (reliability.test.js) |

Never present heuristics as measurements. Every score shows provenance + hash + updated + nextRefresh; every stat shows confidence.
