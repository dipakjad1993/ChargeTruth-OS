/* Plug logic: native fit? adapter? HARD STOP?
   Reads data/plugs.json adapterMatrix + voltage-class rule.
   checkPlugFit(vehicle, stationPlugs[]) -> {status: 'native'|'adapter'|'impossible', ...} */
let MATRIX = [];
let CONNECTORS = [];
export function initPlugLogic(plugsJson) {
  MATRIX = plugsJson.adapterMatrix || [];
  CONNECTORS = plugsJson.connectors || [];
}

function vehicleDcPlug(vehicle) { return vehicle.plugDc || null; }
function vehicleAcPlug(vehicle) { return vehicle.plugAc || null; }

export function checkPlugFit(vehicle, stationPlugs = []) {
  const dc = vehicleDcPlug(vehicle);
  const ac = vehicleAcPlug(vehicle);
  // Swap-only vehicles have no plugs
  if (!dc && !ac) return { status: 'swap-only', label: 'Swap-only vehicle — route to swap cabins, not chargers', adapter: null, hardStop: false };
  // 1. Native DC fit
  if (dc && stationPlugs.includes(dc)) {
    // Voltage-class guard: Bharat DC-001 vs CCS2 are different worlds
    return { status: 'native', label: `Native fit — ${dc} plug matches`, adapter: null, hardStop: false, plugUsed: dc, kind: 'DC' };
  }
  // 2. Native AC fallback (slow but possible)
  if (ac && stationPlugs.includes(ac)) {
    return { status: 'native-ac', label: `AC fallback — ${ac} fits but DC fast unavailable here (slow)`, adapter: null, hardStop: false, plugUsed: ac, kind: 'AC' };
  }
  // 3. Adapter matrix lookup
  const carKey = dc ? dcKey(vehicle) : acKey(vehicle);
  for (const stall of stationPlugs) {
    const hit = MATRIX.find((m) => m.from === carKey && stallMatches(m.to, stall));
    if (hit) {
      return {
        status: hit.possible ? 'adapter' : 'impossible',
        label: hit.possible ? `Adapter needed: ${hit.adapter}. ${hit.warning}` : `HARD STOP: ${hit.warning}`,
        adapter: hit.possible ? hit.adapter : null,
        hardStop: !hit.possible,
        cost: hit.cost || null,
        plugUsed: stall, kind: 'DC-via-adapter'
      };
    }
  }
  // 4. Special hard stops
  if (dc === 'CCS2' && stationPlugs.includes('BharatDC001'))
    return { status: 'impossible', label: 'HARD STOP: Bharat DC-001 (48-72V) cannot charge a 400V CCS2 car — voltage + protocol mismatch.', hardStop: true };
  if (dc === 'CHAdeMO' && stationPlugs.some((p) => p.startsWith('CCS')))
    return { status: 'impossible', label: 'HARD STOP: no CHAdeMO→CCS DC adapter exists. Filter CHAdeMO-only.', hardStop: true };
  return { status: 'impossible', label: `No compatible plug. Your ${dc || ac} vs station [${stationPlugs.join(', ')}]. Skipping.`, hardStop: true };
}

function dcKey(v) {
  if (v.plugDc === 'NACS') return 'NACS-car';
  if (v.plugDc === 'CCS1') return 'CCS1-car';
  if (v.plugDc === 'CCS2') return 'CCS2-car';
  if (v.plugDc === 'CHAdeMO') return 'CHAdeMO-car';
  if (v.plugDc === 'GB-T-DC') return 'GB-T-car';
  if (v.plugDc === 'BharatDC001') return 'BharatDC001-car';
  return 'CCS-car';
}
function acKey(v) {
  if (v.plugAc === 'Type2') return 'CCS2-car';
  if (v.plugAc === 'J1772') return 'CCS1-car';
  return 'CCS-car';
}
function stallMatches(matrixTo, stallPlug) {
  // v2.1: exact normalized match FIRST (prevents CCS1 vs CCS2 false-positives
  // when matrix rows use generic "CCS"), substring heuristic second with warning.
  const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const t = matrixTo || '', s = stallPlug || '';
  if (norm(t) === norm(s)) return true;
  const tl = t.toLowerCase(), sl = (s || '').toLowerCase();
  // Specific-before-generic: CCS1 must not match CCS2 via bare "ccs".
  if (tl.includes('ccs1') || tl.includes('ccs2')) {
    if (tl.includes('ccs1') && sl.includes('ccs1')) return true;
    if (tl.includes('ccs2') && sl.includes('ccs2')) return true;
    if (tl.includes('ccs') && !tl.includes('ccs1') && !tl.includes('ccs2') && sl.includes('ccs')) {
      try { console.warn(`[pluglogic] generic CCS matrix row "${t}" matched stall "${s}" — verify voltage class + latch before routing`); } catch {}
      return true;
    }
    return false;
  }
  if (tl.includes('ccs') && sl.includes('ccs')) {
    try { console.warn(`[pluglogic] generic CCS matrix row "${t}" matched stall "${s}" — verify voltage class + latch before routing`); } catch {}
    return true;
  }
  if (tl.includes('nacs') && sl.includes('nacs')) return true;
  if (tl.includes('chademo') && sl.includes('chademo')) return true;
  if (tl.includes('bharat') && sl.includes('bharat')) return true;
  if (tl.includes('gb') && sl.includes('gb')) return true;
  return false;
}

export function filterStationsByPlug(vehicle, features) {
  return features.filter((f) => {
    const plugs = (f.properties || f).plugs || [];
    const r = checkPlugFit(vehicle, plugs);
    return !r.hardStop;
  });
}
