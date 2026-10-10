/* Media + map-link helpers (ChargeTruth OS v2.2) — pure functions (node-testable) + DOM painters.
   Photos: Wikimedia Commons API (free, no key, hotlink-allowed). OEM sites hotlink-block
   and re-skin constantly, so we NEVER hotlink OEM images — we link the official OEM page
   and show a clearly-credited Commons community photo beside it.
   Map links: plain https URL schemes (Google/OSM/Mapillary). These are NOT billable
   Google Maps Platform APIs (no Places/Directions/Maps-JS calls), so No-Google-Tax stands. */

export function mapsLinks(lat, lon) {
  if (lat == null || lon == null || lat === '' || lon === '') return null;
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const a = la.toFixed(4), o = lo.toFixed(4);
  return {
    coords: `${a}, ${o}`,
    gmaps: `https://www.google.com/maps/search/?api=1&query=${a},${o}`,
    osm: `https://www.openstreetmap.org/?mlat=${a}&mlon=${lo}#map=17/${a}/${o}`,
    mapillary: `https://www.mapillary.com/app/?lat=${a}&lng=${o}&z=17`
  };
}

/* Exact-station location line: coords + free nav links + street-photo link + optional curated photo. */
export function stopLocationHTML(s) {
  const m = s.lat != null && s.lon != null ? mapsLinks(s.lat, s.lon) : null;
  if (!m) return '';
  const photo = s.photo
    ? `<div><a href="${s.photo}" target="_blank" rel="noopener"><img class="vphoto" src="${s.photo}" alt="Photo of ${esc(s.name)}" loading="lazy" onerror="this.remove()"></a><div class="photocap">Station photo — ${esc(s.photoCredit || 'see credit on source page')}.</div></div>`
    : '';
  return `${photo}<div class="locline">📍 <b>${m.coords}</b> · `
    + `<a href="${m.gmaps}" target="_blank" rel="noopener">Google Maps ↗</a> · `
    + `<a href="${m.osm}" target="_blank" rel="noopener">OSM ↗</a> · `
    + `<a href="${m.mapillary}" target="_blank" rel="noopener">street photos ↗</a> `
    + `<span class="muted">(free map links — no Google API bill; photos: Mapillary/CC crowd. Match the name + coords before you plug in.)</span></div>`;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

export function oemLinkHTML(v) {
  if (!v.oemUrl) return '<span class="muted">OEM page: not listed — <a href="https://github.com/dipakjad1993/ChargeTruth-OS/issues">send it via Issues</a>.</span>';
  const brand = String(v.name || '').split(' ')[0];
  return `<a href="${v.oemUrl}" target="_blank" rel="noopener">Official ${esc(brand)} page ↗</a>`
    + (v.oemVerified ? '' : ' <span class="muted" title="Pattern-based URL, not yet HEAD-verified">(unverified)</span>');
}

/* ---- Wikimedia Commons photo lookup (browser; cached). ---- */
export function commonsApiUrl(query) {
  const q = `FILETYPE:BITMAP ${query} electric car`;
  return `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&prop=pageimages&formatversion=2&piprop=thumbnail&pithumbsize=640`
    + `&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=3`;
}

const thumbMemo = new Map();
export async function fetchCommonsThumb(query, cacheKey) {
  if (thumbMemo.has(cacheKey)) return thumbMemo.get(cacheKey);
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('ct-img-' + cacheKey) : null;
    if (raw) { const o = JSON.parse(raw); thumbMemo.set(cacheKey, o); return o; }
  } catch {}
  let out = null;
  try {
    const r = await fetch(commonsApiUrl(query));
    if (r.ok) {
      const j = await r.json();
      const pg = (j.query?.pages || []).find((p) => p.thumbnail?.source);
      if (pg) out = { src: pg.thumbnail.source, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(pg.title)}` };
    }
  } catch {}
  thumbMemo.set(cacheKey, out);
  try { if (out && typeof localStorage !== 'undefined') localStorage.setItem('ct-img-' + cacheKey, JSON.stringify(out)); } catch {}
  return out;
}

/* Paint selected-vehicle photo into an <img> (hides gracefully offline / on miss). */
export async function paintVehiclePhoto(imgEl, capEl, vehicle) {
  if (!imgEl || typeof document === 'undefined') return;
  imgEl.hidden = true;
  if (capEl) capEl.textContent = '';
  if (!vehicle?.imageQuery || typeof fetch === 'undefined') return;
  const t = await fetchCommonsThumb(vehicle.imageQuery, vehicle.id);
  if (!t) {
    if (capEl && vehicle.oemUrl) capEl.innerHTML = `Photo unavailable offline — see the <a href="${vehicle.oemUrl}" target="_blank" rel="noopener">official OEM page ↗</a> for photos.`;
    return;
  }
  imgEl.src = t.src;
  imgEl.alt = `Photo of ${vehicle.name} (Wikimedia Commons community photo)`;
  imgEl.hidden = false;
  imgEl.onerror = () => { imgEl.hidden = true; };
  if (capEl) capEl.innerHTML = `Photo: <a href="${t.page}" target="_blank" rel="noopener">Wikimedia Commons ↗</a> (community photo, unverified — official shots on OEM page).`;
}
