/* Power-match: real kW + real minutes. Hides 350kW hype.
   actualKw = min(stationKw, vehiclePeak(SoC), adapterCap, tempDerate, sharedDerate)
   sessionMinutes integrates the vehicle's SoC curve (vehicles.json curves), NOT peak brochure. */
export function curveKw(curve, soc) {
  if (!curve || !curve.points || !curve.points.length) return 0;
  const pts = curve.points;
  if (soc <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (soc <= pts[i][0]) {
      const [s0, k0] = pts[i - 1], [s1, k1] = pts[i];
      const t = (soc - s0) / Math.max(1e-6, s1 - s0);
      return k0 + t * (k1 - k0);
    }
  }
  return pts[pts.length - 1][1];
}

export function tempDerate(tempC) {
  if (tempC == null) return 1;
  if (tempC <= -15) return 0.5;
  if (tempC <= -5) return 0.65;
  if (tempC <= 0) return 0.8;
  if (tempC >= 45) return 0.8;
  if (tempC >= 40) return 0.9;
  return 1;
}

export function actualKw({ stationKw, vehicle, soc, tempC = 25, sharedStallsActive = 1, stallsTotal = 4, adapterCapKw = Infinity, stationVoltage = null, vehicleVoltage = null, stationAmps = null, preconditioned = false }) {
  const curve = vehicle.curve || { points: [[10, vehicle.maxKwDc || 0]] };
  const vehKw = curveKw(curve, soc);
  let kw = Math.min(stationKw, vehKw, adapterCapKw);
  // Voltage/amp guard (enterprise, opt-in): only when pack voltage + amps known.
  // P = V_vehicle × min(I_station, I_vehicle). Skipped when data absent (backward-compat).
  const vV = vehicleVoltage || vehicle.voltage || null;
  const vA = vehicle.maxAmps || null;
  const sA = stationAmps || null;
  if (vV && vA && sA) {
    const ampCapKw = (vV * Math.min(sA, vA)) / 1000;
    if (ampCapKw > 0 && ampCapKw < kw) kw = ampCapKw;
  }
  kw *= tempDerate(tempC);
  // Preconditioning bonus: warm battery recovers up to 15% in cold
  if (preconditioned && tempC <= 5) kw *= 1.15;
  // Shared-power heuristic: if site power-pools, derate when >60% stalls active
  if (stallsTotal >= 4 && sharedStallsActive / stallsTotal > 0.6) kw *= 0.85;
  return Math.max(0, +kw.toFixed(1));
}

export function sessionMinutes({ vehicle, curve, fromSoc, toSoc, stationKw, tempC = 25, efficiency = 1 }) {
  // Integrate in 2% SoC steps: energy per step / avg kW * 60
  if (toSoc <= fromSoc) return 0;
  if (!vehicle.maxKwDc) return Infinity; // AC-only car on DC planner (legacy numeric path — use sessionMinutesResult for {error})
  const usable = vehicle.usableKwh || vehicle.batteryKwh;
  let mins = 0;
  for (let s = fromSoc; s < toSoc; s += 2) {
    const mid = Math.min(toSoc, s + 1);
    const stepKwh = ((Math.min(toSoc, s + 2) - s) / 100) * usable;
    const kw = actualKw({ stationKw, vehicle: { ...vehicle, curve }, soc: mid, tempC });
    if (kw < 3) { mins += 60; continue; } // taper crawl
    mins += (stepKwh / (kw * efficiency)) * 60;
  }
  // +3 min session overhead (auth, plug, ramp)
  return Math.round(mins + 3);
}

/* Safe wrapper for direct API callers: never returns Infinity.
   AC-only vehicle on DC plan → { mins: null, error }. All other paths → { mins }.
   sessionMinutes() above is kept numeric for backward-compat (app.js + tests). */
export function sessionMinutesResult(args) {
  const { vehicle } = args || {};
  if (!vehicle) return { mins: null, error: 'No vehicle supplied' };
  if (!vehicle.maxKwDc) {
    return {
      mins: null,
      error: `${vehicle.name || 'This vehicle'} is AC-ONLY (no DC inlet) — DC highway planning impossible. Plan overnight Type 2 charging; this trip needs a different vehicle or daytime Type 2 halts (hours, not minutes).`
    };
  }
  const mins = sessionMinutes(args);
  if (!Number.isFinite(mins)) return { mins: null, error: 'Session could not be estimated (taper crawl below 3kW). Try a higher-power stall or warmer battery.' };
  return { mins };
}

export function powerMatchSummary({ vehicle, stationKw, soc = 20, tempC = 25 }) {
  const curve = vehicle.curve;
  const kw = actualKw({ stationKw, vehicle: { ...vehicle, curve }, soc, tempC });
  const hype = stationKw > (vehicle.maxKwDc || 0) * 1.5;
  const t1080 = sessionMinutes({ vehicle, curve, fromSoc: 10, toSoc: 80, stationKw, tempC });
  return {
    youGetKw: kw, stationKw, vehiclePeak: vehicle.maxKwDc,
    wastedKw: Math.max(0, stationKw - kw),
    hypeFlag: hype,
    message: hype
      ? `This ${stationKw}kW stall gives your ${vehicle.name} ${kw}kW max — you pay for electrons, not headlines. 10→80% ≈ ${t1080} min.`
      : `Good match: ${kw}kW of ${stationKw}kW usable. 10→80% ≈ ${t1080} min.`,
    t1080
  };
}
