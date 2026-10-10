import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsLinks, commonsApiUrl, stopLocationHTML, oemLinkHTML } from '../src/js/media.js';
import vehicles from '../data/vehicles.json' with { type: 'json' };
import v2h from '../data/v2h-batteries.json' with { type: 'json' };

test('mapsLinks embeds exact coords in all three free URL schemes', () => {
  const m = mapsLinks(19.076, 72.8777);
  assert.equal(m.coords, '19.0760, 72.8777');
  assert.ok(m.gmaps.includes('google.com/maps/search') && m.gmaps.includes('19.0760%2C72.8777') === false, m.gmaps);
  assert.ok(m.gmaps.includes('19.0760,72.8777'), m.gmaps);
  assert.ok(m.osm.includes('openstreetmap.org') && m.osm.includes('19.0760'), m.osm);
  assert.ok(m.mapillary.includes('mapillary.com') && m.mapillary.includes('72.8777'), m.mapillary);
});

test('mapsLinks returns null for missing coords', () => {
  assert.equal(mapsLinks(null, 72.8), null);
  assert.equal(mapsLinks(undefined, undefined), null);
});

test('commonsApiUrl is a keyless Commons API query', () => {
  const u = commonsApiUrl('Tata Nexon.ev');
  assert.ok(u.startsWith('https://commons.wikimedia.org/w/api.php'), u);
  assert.ok(u.includes('origin=*') && u.includes('generator=search') && u.includes('gsrnamespace=6'), u);
});

test('stopLocationHTML shows coords + 3 links, photo only when present', () => {
  const a = stopLocationHTML({ name: 'S1', lat: 19.062, lon: 72.865 });
  assert.ok(a.includes('19.0620, 72.8650') && a.includes('Google Maps') && a.includes('OSM') && a.includes('street photos'), a);
  assert.ok(!a.includes('<img'), 'no img without s.photo');
  const b = stopLocationHTML({ name: 'S1', lat: 19.062, lon: 72.865, photo: 'https://example.com/p.jpg', photoCredit: 'CC-BY' });
  assert.ok(b.includes('<img') && b.includes('CC-BY'), b);
  assert.equal(stopLocationHTML({ name: 'S2' }), '');
});

test('oemLinkHTML links official page, flags unverified', () => {
  const a = oemLinkHTML({ name: 'Tesla Model Y', oemUrl: 'https://www.tesla.com/modely', oemVerified: true });
  assert.ok(a.includes('https://www.tesla.com/modely') && !a.includes('unverified'), a);
  const b = oemLinkHTML({ name: 'X', oemUrl: 'https://example.com/x', oemVerified: false });
  assert.ok(b.includes('unverified'), b);
  assert.ok(oemLinkHTML({ name: 'Y' }).includes('not listed'), 'missing url handled');
});

test('every vehicle has discovery fields + valid curve + sane battery', () => {
  const curves = new Set(Object.keys(vehicles.curves));
  for (const v of vehicles.vehicles) {
    assert.ok(v.id && v.name, `id/name missing: ${JSON.stringify(v).slice(0, 80)}`);
    assert.ok(v.batteryKwh > 0, `${v.id} battery`);
    assert.ok((v.usableKwh ?? v.batteryKwh) <= v.batteryKwh, `${v.id} usable>total`);
    assert.ok(curves.has(v.curveId), `${v.id} curve ${v.curveId} missing`);
    assert.ok(typeof v.imageQuery === 'string' && v.imageQuery.length > 2, `${v.id} imageQuery`);
    assert.ok(!v.oemUrl || v.oemUrl.startsWith('https://'), `${v.id} oemUrl scheme`);
    assert.equal(typeof v.oemVerified, 'boolean', `${v.id} oemVerified`);
  }
  assert.ok(vehicles.vehicles.length >= 150, `want worldwide coverage, got ${vehicles.vehicles.length}`);
});

test('OEM coverage: all but known-obscure vehicles have links', () => {
  const missing = vehicles.vehicles.filter((v) => !v.oemUrl).map((v) => v.id);
  assert.deepEqual(missing, ['alpar-3w-9']);
});

test('v2h batteries are buyable: official https URLs + specs', () => {
  assert.ok(v2h.batteries.length >= 6, 'battery catalog present');
  for (const b of v2h.batteries) {
    assert.ok(b.capacityKwh > 0 && b.powerKw > 0, `${b.id} specs`);
    assert.ok(b.url.startsWith('https://') && b.buyUrl.startsWith('https://'), `${b.id} urls`);
    assert.ok(b.priceNote && b.notes, `${b.id} copy`);
  }
});
