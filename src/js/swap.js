/* Swap Finder + ROI. Physical fit enforced (app merge ≠ physical interop).
   availability(station, hourOfDay, network) -> heuristic 0..1
   swapPlan(...) -> ordered cabin stops with mins + Rs. swapVsChargeROI(...) */
export function availability01(station, hour = 12, network = null, opts = {}) {
  const docks = station.docks || 4;
  const reports = station.reports30d || {};
  const total = (reports.ok || 0) + (reports.fail || 0);
  const base = total ? (reports.ok / total) : 0.8;
  // Rush derate from network pattern
  let rush = 1;
  const id = (station.swap || network?.id || '').toLowerCase();
  const isLunch = hour >= 11.5 && hour <= 14.5;
  const isDinner = hour >= 18 && hour <= 22;
  const dow = opts.dow ?? new Date().getDay();
  const isWeekend = dow === 0 || dow === 6;
  if (isLunch || isDinner) {
    if (id.includes('sun')) rush = 0.5;
    else if (id.includes('gogoro') || id.includes('bounce') || id.includes('yuma') || id.includes('honda')) rush = 0.55;
    else if (id.includes('ola')) rush = (hour >= 9 && hour <= 11) || (hour >= 17 && hour <= 20) ? 0.6 : 0.85;
    else if (id.includes('choco') || id.includes('catl')) rush = ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) ? 0.6 : 0.9;
    else if (id.includes('nio') || id.includes('geely')) rush = 0.7;
    else rush = 0.65;
  }
  if (isWeekend && (id.includes('vida') || id.includes('ola'))) rush *= 0.85;
  // Weather/holiday boost hook (enterprise: pass opts.rain / opts.holiday)
  if (opts.rain) rush *= 0.9;
  if (opts.holiday) rush *= 0.8;
  const dockFactor = Math.min(1, docks / 8 + 0.4); // more docks = buffer
  const avail = Math.max(0.05, Math.min(0.99, base * rush * (0.7 + 0.3 * dockFactor)));
  // p50/p90 wait estimator for swap queues (Paren-style: peaks hide in averages)
  const q = reports.queue || 0;
  const p50min = avail < 0.5 ? 6 : avail < 0.7 ? 3 : 1;
  const p90min = avail < 0.5 ? 14 : avail < 0.7 ? 7 : 3;
  return opts.withWait ? { avail, p50min, p90min } : avail;
}

export function physicalFit(vehicleSwapId, stationSwapId) {
  if (!vehicleSwapId) return { fit: false, reason: 'Vehicle is plug-in, not swap — route to chargers' };
  if (!stationSwapId) return { fit: false, reason: 'Station is plug-in charger, not swap cabin' };
  if (vehicleSwapId === stationSwapId) return { fit: true, reason: 'Native swap fit' };
  // Post-Sept-2026 NIO+Geely app merge: shared discovery, SEPARATE lanes
  if ((vehicleSwapId === 'NIO-Power' && stationSwapId === 'Geely-Yiyi') ||
      (vehicleSwapId === 'Geely-Yiyi' && stationSwapId === 'NIO-Power'))
    return { fit: 'app-only', reason: 'App merge: shared payment/discovery but separate robot lanes — verify lane type, +5 min' };
  return { fit: false, reason: `Physical mismatch: ${vehicleSwapId} pack does not latch in ${stationSwapId} cabin (BMS handshake differs)` };
}

export function swapPlan({ vehicle, stations, distanceKm, consumptionPerKm = 0.032, startSocPack = 1.0, hour = 12, networks = [] }) {
  // packs needed = ceil(distance * kwhPerKm / packKwh)
  const net = networks.find((n) => n.id === vehicle.swap);
  if (!net) return { stops: [], error: 'No swap network for this vehicle' };
  const packKwh = net.packKwh * (net.packsPerVehicle || 1);
  const needKwh = distanceKm * consumptionPerKm;
  const swapsNeeded = Math.max(0, Math.ceil(needKwh / packKwh - startSocPack) );
  const compatible = stations.filter((s) => physicalFit(vehicle.swap, s.swap).fit === true);
  const ranked = compatible.map((s) => ({ s, avail: availability01(s, hour, net) }))
    .sort((a, b) => b.avail - a.avail).slice(0, Math.max(swapsNeeded, 1));
  const perSwap = net.pricePerSwapINR || 70;
  return {
    network: net.name,
    swapsNeeded: Math.max(ranked.length, swapsNeeded),
    totalMins: ranked.length * (net.swapTimeMin || 2) + ranked.length * 1, // +1 queue buffer
    totalINR: ranked.length * perSwap,
    stops: ranked.map(({ s, avail }, i) => ({
      n: i + 1, name: s.name, id: s.id,
      availPct: Math.round(avail * 100),
      mins: (net.swapTimeMin || 2), priceINR: perSwap,
      warn: avail < 0.5 ? 'Low battery availability at rush — have Plan B cabin' : null
    })),
    message: ranked.length ? `Swap at ${ranked.map((r) => r.s.name).join(' → ')}, ${ranked.length * (net.swapTimeMin || 2)} mins total, Rs ${ranked.length * perSwap}` : 'No compatible swap cabins on corridor — extend search radius'
  };
}

export function swapVsChargeROI({ kmPerDay = 120, daysPerMonth = 26, swapPrice = 70, swapsPerDay = 3, chargeCostPerDay = 40, chargeHoursPerDay = 3, riderHourly = 150 }) {
  const swapMonth = swapPrice * swapsPerDay * daysPerMonth;
  const chargeMonth = chargeCostPerDay * daysPerMonth;
  const timeSavedHrsDay = chargeHoursPerDay - (swapsPerDay * 5 / 60);
  const timeValueMonth = timeSavedHrsDay * riderHourly * daysPerMonth;
  const net = timeValueMonth - (swapMonth - chargeMonth);
  return {
    swapMonth: Math.round(swapMonth), chargeMonth: Math.round(chargeMonth),
    timeSavedHrsDay: +timeSavedHrsDay.toFixed(2), timeValueMonth: Math.round(timeValueMonth),
    netBenefitINR: Math.round(net),
    verdict: net > 0 ? `Swap wins by Rs ${Math.round(net).toLocaleString('en-IN')}/month — 5-min swap Rs ${swapPrice} beats 3-hr charge Rs ${chargeCostPerDay / 1} because rider time (Rs ${riderHourly}/hr) dominates.` : 'Charge wins on pure rupees — but check rush-hour delivery SLA penalties.',
    fleet500: { hrsSavedDay: +(timeSavedHrsDay * 500).toFixed(0), note: '25 min/rider/day × 500 riders ≈ 208 hrs/day. That is headcount.' }
  };
}
