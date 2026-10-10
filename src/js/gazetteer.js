/* Local OSM gazetteer — substring + population-ranked. No autocomplete API. */
export function searchCities(cities, q, limit = 8) {
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = [];
  for (const c of cities) {
    const name = c.n.toLowerCase();
    let s = -1;
    if (name === q) s = 100;
    else if (name.startsWith(q)) s = 60;
    else if (name.includes(q)) s = 30;
    else if ((c.s || '').toLowerCase().includes(q)) s = 10;
    if (s > 0) scored.push({ c, s: s + Math.log10((c.pop || 10000)) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}
export function fmtCity(c) { return `${c.n}, ${c.s} (${c.c})`; }
