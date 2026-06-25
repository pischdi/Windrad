/**
 * ========================================
 * Elevation API — MVP (Schritt 1)
 * Cloudflare Worker
 * ========================================
 *
 * Höhendaten-Dienst auf Basis der bestehenden Brandenburg-ALS-Tiles
 * (Uint16-Höhengrid, 1000x1000, 1m-Auflösung, Werte in cm, EPSG:25833).
 *
 * Endpunkte:
 *   GET /v1/point?lat=<>&lon=<>          → Höhe an einem Punkt (bilinear interpoliert)
 *   GET /v1/health                       → Liveness-Check
 *
 * Geplant (Schritt 2/3):
 *   GET /v1/profile      → Höhenprofil entlang einer Linie
 *   GET /v1/line-of-sight → Sichtbarkeit / verdeckter Anteil
 *
 * Tiles werden bevorzugt über das R2-Binding `TILES` gelesen; ist keines
 * konfiguriert, fällt der Worker auf die öffentliche R2-URL zurück.
 */

const TILE_SIZE = 1000;          // Meter pro Kachelkante = Gridzellen pro Kante
const PUBLIC_R2 = 'https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/v1/health') {
        return json({ status: 'ok', service: 'elevation-api', version: 'mvp-1' });
      }

      if (url.pathname === '/v1/point') {
        return await handlePoint(url, env);
      }

      return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    } catch (err) {
      return json({ error: err.message, code: err.code || 'INTERNAL' }, err.status || 500);
    }
  },
};

/**
 * GET /v1/point?lat=<>&lon=<>
 */
async function handlePoint(url, env) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));

  if (!isFinite(lat) || !isFinite(lon)) {
    throw apiError('Query params "lat" and "lon" required (decimal degrees, WGS84)', 400, 'BAD_REQUEST');
  }

  const { x, y } = wgs84ToUtm33(lat, lon);
  const cache = new Map();
  const elevation = await bilinearElevation(x, y, env, cache);

  if (elevation === null) {
    throw apiError('No elevation data for these coordinates (outside covered tiles)', 404, 'OUT_OF_COVERAGE');
  }

  return json({
    lat,
    lon,
    elevation: Math.round(elevation * 100) / 100,
    unit: 'm',
    source: 'DGM Brandenburg (ALS)',
    resolution_m: 1,
  });
}

/**
 * Bilineare Interpolation der Höhe an einer UTM-Position (x, y in Metern).
 * Lädt für jede der 4 umliegenden Gridzellen die passende Kachel (über Cache).
 * Werte von 0 werden als "keine Daten" behandelt.
 */
async function bilinearElevation(x, y, env, cache) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;

  const h00 = await cellElevation(x0,     y0,     env, cache);
  const h10 = await cellElevation(x0 + 1, y0,     env, cache);
  const h01 = await cellElevation(x0,     y0 + 1, env, cache);
  const h11 = await cellElevation(x0 + 1, y0 + 1, env, cache);

  const corners = [h00, h10, h01, h11].filter((h) => h !== null);
  if (corners.length === 0) return null;

  // Fehlende Ecken (nodata) durch Mittel der vorhandenen ersetzen,
  // damit die Interpolation an Datenrändern nicht kippt.
  const fallback = corners.reduce((a, b) => a + b, 0) / corners.length;
  const v00 = h00 ?? fallback, v10 = h10 ?? fallback;
  const v01 = h01 ?? fallback, v11 = h11 ?? fallback;

  const top = v00 * (1 - fx) + v10 * fx;
  const bottom = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Höhe einer einzelnen Gridzelle (Integer-Meter, EPSG:25833) in Metern,
 * oder null bei nodata / fehlender Kachel.
 */
async function cellElevation(x, y, env, cache) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  const tile = await loadTile(tileX, tileY, env, cache);
  if (!tile) return null;

  const localX = x - tileX * TILE_SIZE;
  const localY = y - tileY * TILE_SIZE;
  if (localX < 0 || localX >= TILE_SIZE || localY < 0 || localY >= TILE_SIZE) return null;

  const heightCm = tile[localY * TILE_SIZE + localX];
  if (heightCm === 0) return null; // nodata
  return heightCm / 100.0;
}

/**
 * Lädt eine Kachel als Uint16Array (mit Request-lokalem Cache).
 * Liefert null, wenn die Kachel nicht existiert (außerhalb der Abdeckung).
 */
async function loadTile(tileX, tileY, env, cache) {
  const key = `tile_${tileX}_${tileY}.bin`;
  if (cache.has(key)) return cache.get(key);

  let buffer = null;

  // 1) Bevorzugt: R2-Binding
  if (env && env.TILES) {
    const obj = await env.TILES.get(key);
    if (obj) buffer = await obj.arrayBuffer();
  }

  // 2) Fallback: öffentliche R2-URL
  if (!buffer) {
    const resp = await fetch(`${PUBLIC_R2}/${key}`);
    if (resp.ok) buffer = await resp.arrayBuffer();
  }

  if (!buffer) {
    cache.set(key, null);
    return null;
  }

  if (buffer.byteLength !== TILE_SIZE * TILE_SIZE * 2) {
    throw apiError(`Invalid tile size for ${key}: ${buffer.byteLength} bytes`, 500, 'BAD_TILE');
  }

  const arr = new Uint16Array(buffer);
  cache.set(key, arr);
  return arr;
}

/**
 * WGS84 (lat/lon) → ETRS89/UTM Zone 33N (EPSG:25833).
 *
 * Vollständige Transverse-Mercator-Vorwärtsformel (Snyder) inkl.
 * Meridianbogen M. Die in der Frontend-App genutzte Näherung
 * (y = k0·N·φ) ließ M weg und lieferte einen um ~37 km falschen
 * Northing — daher hier die korrekte Variante. Verifiziert gegen alle
 * vier bekannten Windrad-Kacheln (Northing/Easting + plausible Höhen).
 */
function wgs84ToUtm33(lat, lon) {
  const a = 6378137.0;                 // WGS84 große Halbachse
  const f = 1 / 298.257223563;         // Abplattung
  const e2 = f * (2 - f);              // erste Exzentrizität²
  const k0 = 0.9996;                   // Maßstabsfaktor
  const lon0 = (15 * Math.PI) / 180;   // Mittelmeridian Zone 33N

  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const ep2 = e2 / (1 - e2);

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = (lam - lon0) * Math.cos(phi);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );

  const x = k0 * N * (
    A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120
  ) + 500000;

  const y = k0 * (
    M + N * Math.tan(phi) * (
      (A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720
    )
  );

  return { x, y };
}

// ---- Helpers ----

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function apiError(message, status, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}
