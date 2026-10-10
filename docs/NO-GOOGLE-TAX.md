# NO-GOOGLE-TAX — the $15k-before-10k-users math

| Google SKU (2026 list-ish) | $/1k | 10k users × 10 sessions × 3 calls | Cost |
|---|---|---|---|
| Places Autocomplete | ~$17 | 300k | ~$5,100 |
| Directions | ~$5 | 100k | ~$500 |
| Distance Matrix | ~$5 | 100k | ~$500 |
| Maps JS loads | ~$7 | 100k | ~$700 |
| **Subtotal before tiles/routes retries** | | | **~$7–15k** |

ChargeTruth substitution ($0 marginal):

- Autocomplete → `data/cities.json` + `gazetteer.js` (400+ cities, substring+pop-ranked, offline).
- Directions/Matrix → `trip-planner.js` (Haversine×1.25 offline; self-hosted Valhalla when online).
- Maps JS → OSM raster/vector tiles cached by `sw.js` + pack manifest (self-host for fleets to respect tile policy).
- Uptime/crowd → OSM dump + OCM quarterly dump + local reports → Supabase/D1 free tier.

You still pay servers/tiles-at-scale — but $0 per API call, and the app works in the Western Ghats with zero signal.
