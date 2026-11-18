// Builds site/countries.json: one record per country with its unlock time,
// store-listing wave and a pre-projected SVG path.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, filter, filterWeight } from 'topojson-simplify';
import { geoPath } from 'd3-geo';
import { geoMiller, geoProject } from 'd3-geo-projection';
import ct from 'countries-and-timezones';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-50m.json');
const iso = require('i18n-iso-countries');

// ---- map frame -------------------------------------------------------------
const W = 2000;
const LAT_N = +(process.env.LAT_N ?? 78), LAT_S = +(process.env.LAT_S ?? -57);
const MIN_WEIGHT = +(process.env.MIN_WEIGHT ?? 1.2);   // simplification, units²
const MIN_RING = +(process.env.MIN_RING ?? 5);         // drop rings smaller than this, units²
const proj = geoMiller().rotate([-11, 0]).scale(W / (2 * Math.PI)).translate([W / 2, 0]);
const yTop = proj([11, LAT_N])[1], yBot = proj([11, LAT_S])[1];
const H = Math.round(yBot - yTop);
proj.translate([W / 2, -yTop]).clipExtent([[0, 0], [W, H]]);

// ---- the 15 PlayStation Store waves (63 countries and regions) --------------
const WAVES = [
  ['2026-11-18T11:00Z', 'NZ'],
  ['2026-11-18T13:00Z', 'AU'],
  ['2026-11-18T15:00Z', 'JP KR'],
  ['2026-11-18T16:00Z', 'HK MY SG TW'],
  ['2026-11-18T17:00Z', 'ID TH'],
  ['2026-11-18T18:30Z', 'IN'],
  ['2026-11-18T20:00Z', 'AE'],
  ['2026-11-18T21:00Z', 'SA TR'],
  ['2026-11-18T22:00Z', 'BG CY FI GR IL RO ZA UA'],
  ['2026-11-18T23:00Z', 'AT BE HR CZ DK FR DE HU IT LU MT NL NO PL SK SI ES SE CH'],
  ['2026-11-19T00:00Z', 'IS IE PT GB'],
  ['2026-11-19T03:00Z', 'AR BR CL PY UY'],
  ['2026-11-19T04:00Z', 'BO'],
  ['2026-11-19T05:00Z', 'CA CO EC PA PE US'],
  ['2026-11-19T06:00Z', 'CR SV GT HN MX NI'],
].map(([t, codes]) => ({ t: Date.parse(t), codes: codes.split(' ') }));
const waveOf = new Map();
WAVES.forEach((w, i) => w.codes.forEach(c => waveOf.set(c, i + 1)));

// Reference zone for each country: where "midnight" is read from.
const REF = {
  NZ: 'Pacific/Auckland', AU: 'Australia/Sydney', MY: 'Asia/Kuala_Lumpur', ID: 'Asia/Jakarta',
  UA: 'Europe/Kyiv', CY: 'Asia/Nicosia', FR: 'Europe/Paris', DE: 'Europe/Berlin', ES: 'Europe/Madrid',
  DK: 'Europe/Copenhagen', NL: 'Europe/Amsterdam', NO: 'Europe/Oslo', PT: 'Europe/Lisbon', GB: 'Europe/London',
  AR: 'America/Argentina/Buenos_Aires', BR: 'America/Sao_Paulo', CL: 'America/Santiago', CA: 'America/Toronto',
  EC: 'America/Guayaquil', US: 'America/New_York', MX: 'America/Mexico_City',
  // no store listing: capital's zone
  RU: 'Europe/Moscow', CN: 'Asia/Shanghai', KZ: 'Asia/Almaty', MN: 'Asia/Ulaanbaatar', CD: 'Africa/Kinshasa',
  GL: 'America/Nuuk', KI: 'Pacific/Tarawa', FM: 'Pacific/Pohnpei', PG: 'Pacific/Port_Moresby', UZ: 'Asia/Tashkent',
  PS: 'Asia/Hebron', MH: 'Pacific/Majuro', PF: 'Pacific/Tahiti', TF: 'Indian/Kerguelen',
  VN: 'Asia/Ho_Chi_Minh', XK: 'Europe/Belgrade', NC: 'Asia/Famagusta', SL0: 'Africa/Mogadishu',
};
// Features without an ISO code in the atlas.
const BY_NAME = { 'Kosovo': 'XK', 'N. Cyprus': 'NC', 'Somaliland': 'SL0' };
const SKIP = new Set(['Antarctica', 'Indian Ocean Ter.', 'Ashmore and Cartier Is.', 'Siachen Glacier',
  'Fr. S. Antarctic Lands', 'S. Geo. and the Is.', 'Heard I. and McDonald Is.', 'Br. Indian Ocean Ter.']);
// Unlisted countries with several time zones: say whose midnight is shown.
const BY = { RU: 'Moscow', CD: 'Kinshasa', GL: 'Nuuk', MN: 'Ulaanbaatar', PG: 'Port Moresby' };

const NAME_FIX = {
  'United States of America': 'United States', 'Dem. Rep. Congo': 'DR Congo', 'Central African Rep.': 'Central African Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina', 'Dominican Rep.': 'Dominican Republic', 'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan', 'N. Cyprus': 'Northern Cyprus', 'W. Sahara': 'Western Sahara', 'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands', 'eSwatini': 'Eswatini', 'Macedonia': 'North Macedonia', 'Turkey': 'Türkiye',
  'Fr. Polynesia': 'French Polynesia', 'Fr. S. Antarctic Lands': 'French Southern Lands', 'Faeroe Is.': 'Faroe Islands',
  'Cayman Is.': 'Cayman Islands', 'Turks and Caicos Is.': 'Turks and Caicos Islands', 'N. Mariana Is.': 'Northern Mariana Islands',
  'U.S. Virgin Is.': 'US Virgin Islands', 'British Virgin Is.': 'British Virgin Islands', 'Marshall Is.': 'Marshall Islands',
  'Cook Is.': 'Cook Islands', 'S. Geo. and the Is.': 'South Georgia', 'St. Vin. and Gren.': 'St. Vincent and the Grenadines',
  'Antigua and Barb.': 'Antigua and Barbuda', 'São Tomé and Principe': 'São Tomé and Príncipe', 'Heard I. and McDonald Is.': 'Heard Island',
  'Wallis and Futuna Is.': 'Wallis and Futuna', 'Pitcairn Is.': 'Pitcairn Islands', 'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
  'Åland': 'Åland Islands', 'Congo': 'Congo-Brazzaville', 'Cabo Verde': 'Cape Verde', 'Czechia': 'Czechia',
};

// ---- time zone helpers -------------------------------------------------------
function offsetMin(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t) / 60000;
}
function localMidnight(tz) {            // the instant 19 Nov 2026 begins in tz
  const base = Date.UTC(2026, 10, 19);
  let t = base - offsetMin(tz, base) * 60000;
  return base - offsetMin(tz, t) * 60000;
}

// ---- geometry ----------------------------------------------------------------
const fc = feature(world, world.objects.countries);
const planar = geoPath();
const kept = [];
for (const f of fc.features) {
  const rawName = f.properties.name;
  if (SKIP.has(rawName)) continue;
  const a = f.id !== undefined ? iso.numericToAlpha2(f.id) : BY_NAME[rawName];
  if (!a) { console.warn('no code for', f.id, rawName); continue; }
  const g = geoProject(f.geometry, proj);
  if (!g) continue;
  // label point: centroid of the largest polygon
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null, bestA = -1;
  for (const p of polys) { const A = Math.abs(planar.area({ type: 'Polygon', coordinates: p })); if (A > bestA) { bestA = A; best = p; } }
  const [cx, cy] = planar.centroid({ type: 'Polygon', coordinates: best });
  const [[x0, y0], [x1, y1]] = planar.bounds(g);
  kept.push({ type: 'Feature', properties: { a, rawName, cx, cy, diag: Math.hypot(x1 - x0, y1 - y0), area: Math.abs(planar.area(g)) }, geometry: g });
}

let topo = topology({ c: { type: 'FeatureCollection', features: kept } });
topo = presimplify(topo);
topo = simplify(topo, MIN_WEIGHT);
topo = filter(topo, filterWeight(topo, MIN_RING));
const simpleGeom = new Map(feature(topo, topo.objects.c).features.map(f => [f.properties.a, f.geometry]));

let nPts = 0;
function encode(geom) {
  if (!geom) return '';
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    const pts = [];
    for (const [x, y] of ring) {
      const p = [Math.round(x), Math.round(y)];
      const q = pts[pts.length - 1];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    nPts += pts.length;
    let s = 'M' + pts[0][0] + ' ' + pts[0][1] + 'l', first = true;
    for (let i = 1; i < pts.length; i++) {
      for (const v of [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]) {
        s += (first || v < 0 ? '' : ' ') + v; first = false;
      }
    }
    d += s + 'z';
  }
  return d;
}

// ---- records -----------------------------------------------------------------
const records = [], problems = [];
for (const f of kept) {
  const { a, rawName, cx, cy, diag } = f.properties;
  const w = waveOf.get(a) || 0;
  const info = ct.getCountry(a);
  let ref = REF[a];
  if (!ref) {
    const zs = info ? info.timezones : [];
    if (!zs.length) { problems.push('no zone: ' + a + ' ' + rawName); continue; }
    if (zs.length > 1 && !w) problems.push(`multi-zone, took first: ${a} ${rawName} ${zs.join(',')}`);
    ref = zs[0];
  }
  const midnight = localMidnight(ref);
  const t = w ? WAVES[w - 1].t : midnight;
  if (w && midnight !== t) problems.push(`LISTED MISMATCH ${a} ${rawName}: ${ref} midnight ${new Date(midnight).toISOString()} vs wave ${new Date(t).toISOString()}`);
  const d = encode(simpleGeom.get(a));
  const dot = w && diag < 14 ? 1 : 0;
  if (!d && !dot) continue;                       // too small to draw
  const rec = { a, n: NAME_FIX[rawName] || rawName, t: t / 60000, w, c: [Math.round(cx), Math.round(cy)] };
  if (BY[a]) rec.by = BY[a];
  if (dot) rec.dot = 1;
  rec.d = d;
  records.push(rec);
}
const missing = [...waveOf.keys()].filter(c => !records.some(r => r.a === c));
if (missing.length) problems.push('LISTED COUNTRIES MISSING FROM MAP: ' + missing.join(' '));
records.sort((p, q) => p.t - q.t || p.n.localeCompare(q.n));

const out = '[\n' + records.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';
fs.writeFileSync(new URL('../countries.json', import.meta.url), out);

console.log(JSON.stringify({ W, H, records: records.length, listed: records.filter(r => r.w).length, points: nPts,
  bytes: out.length, pathBytes: records.reduce((s, r) => s + r.d.length, 0),
  dots: records.filter(r => r.dot).map(r => r.n) }));
console.log(problems.join('\n') || 'no problems');
console.log('names with dots/abbrev:', records.filter(r => /\.|\bIs\b|\bRep\b/.test(r.n)).map(r => r.n).join(' | '));
const times = new Map();
for (const r of records) { const k = new Date(r.t * 60000).toISOString().slice(5, 16); times.set(k, (times.get(k) || []).concat(r.n + (r.w ? '*' : ''))); }
for (const [k, v] of [...times].sort()) console.log(k, v.join(', '));

// ---- static preview (for tuning the look only) -------------------------------
const at = Date.parse(process.env.AT ?? '2026-11-18T21:30Z') / 60000;
const nextT = Math.min(...WAVES.map(w => w.t / 60000).filter(t => t > at));
const P = records.map(r => `<path d="${r.d}" fill="${r.t <= at ? 'url(#sun)' : '#4a2d7a'}"/>`).join('');
const unl = records.filter(r => !r.w).map(r => r.d).join('');
const nxt = records.filter(r => r.w && r.t === nextT).map(r => r.d).join('');
const dots = records.filter(r => r.dot).map(r => `<circle cx="${r.c[0]}" cy="${r.c[1]}" r="6" fill="${r.t <= at ? 'url(#sun)' : '#4a2d7a'}" stroke="#150a2a" stroke-width="1.5"/>`).join('');
fs.writeFileSync(new URL('./preview.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="1400">
<defs><linearGradient id="sun" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
<stop offset="0" stop-color="#ff3d9a"/><stop offset=".45" stop-color="#ff6f61"/><stop offset=".75" stop-color="#ff9f45"/><stop offset="1" stop-color="#ffd166"/></linearGradient>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(-40)"><rect width="10" height="4.2" fill="#2a1650"/></pattern>
<clipPath id="unl"><path d="${unl}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="#170b2e"/>
<g stroke="#170b2e" stroke-width="1.1" stroke-linejoin="round">${P}</g>
<rect width="${W}" height="${H}" fill="url(#hatch)" clip-path="url(#unl)"/>
${dots}
<path d="${nxt}" fill="rgba(55,230,208,.25)" stroke="#37e6d0" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`);
