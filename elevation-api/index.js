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
 *   GET /v1/profile?from=<lat,lon>&to=<lat,lon>&samples=<n>
 *                                        → Höhenprofil entlang einer Linie
 *   GET /v1/line-of-sight?observer=<lat,lon[,h]>&target=<lat,lon[,h]>&samples=<n>
 *                                        → Sichtbarkeit / verdeckter Anteil
 *   GET /v1/health                       → Liveness-Check
 *
 * Tiles werden bevorzugt über das R2-Binding `TILES` gelesen; ist keines
 * konfiguriert, fällt der Worker auf die öffentliche R2-URL zurück.
 */

// Losspinne-Standorte (OSM, ODbL) — Positionsquelle für /losspinne.
// POC: gebündelt aus JSON; produktiv später aus privatem Store (R2-Binding).
import LOSSPINNE_SITES from './losspinne_sites.json';

const VERSION = '1.0.0-mvp';
const TILE_SIZE = 1000;          // Meter pro Kachelkante = Gridzellen pro Kante
const PUBLIC_R2 = 'https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev';
const DEFAULT_SAMPLES = 200;     // Stützpunkte für Profil/LoS (wie Frontend-CONFIG)
const MAX_SAMPLES = 1000;        // Obergrenze, begrenzt Tile-Zugriffe pro Request
const EYE_HEIGHT = 1.7;          // Standard-Augenhöhe Beobachter (m)
const BLOCKED_THRESHOLD = 10;    // < 10% sichtbar  → blocked
const PARTIAL_THRESHOLD = 70;    // < 70% sichtbar  → partial

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
      // Health-Check: ohne Auth/Rate-Limit.
      if (url.pathname === '/v1/health') {
        return json({ status: 'ok', service: 'elevation-api', version: VERSION });
      }

      // Öffentliche Doku (ohne Auth/Rate-Limit).
      if (url.pathname === '/openapi.json') {
        return json(buildOpenApi(url.origin));
      }
      if (url.pathname === '/' || url.pathname === '/docs') {
        return new Response(DOCS_HTML, {
          headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/demo') {
        return new Response(DEMO_HTML, {
          headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/gefaelle') {
        return new Response(GEFAELLE_HTML, {
          headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/losspinne') {
        return new Response(LOSSPINNE_HTML, {
          headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/losspinne/sites.json') {
        return new Response(JSON.stringify(LOSSPINNE_SITES), {
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8',
                     'Cache-Control': 'no-cache' },
        });
      }

      // Auth + Rate-Limit für alle Datenendpunkte.
      const gate = await authAndRateLimit(request, env);
      if (gate) return gate; // 401 / 429

      if (url.pathname === '/v1/point') {
        return await handlePoint(url, env);
      }

      if (url.pathname === '/v1/profile') {
        return await handleProfile(url, env);
      }

      if (url.pathname === '/v1/line-of-sight') {
        return await handleLineOfSight(url, env);
      }

      if (url.pathname === '/v1/slope') {
        return await handleSlope(url, env);
      }
      if (url.pathname === '/v1/viewshed') {
        return await handleViewshed(url, env);
      }

      return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    } catch (err) {
      return json({ error: err.message, code: err.code || 'INTERNAL' }, err.status || 500);
    }
  },
};

/**
 * Auth + Rate-Limiting für Datenendpunkte.
 *
 * - Mit Header `X-API-Key`: Key wird gegen KV (API_KEYS) geprüft.
 *   Ungültig → 401. Gültig → großzügiges Limit pro Key (RL_KEY).
 * - Ohne Key: anonymer Zugang mit striktem Limit pro Client-IP (RL_ANON).
 *
 * Gibt eine Fehler-Response zurück, wenn blockiert werden soll, sonst null.
 * Fehlt ein Binding (z.B. lokal), wird das Gate übersprungen (fail-open).
 */
async function authAndRateLimit(request, env) {
  const apiKey = request.headers.get('X-API-Key');

  if (apiKey) {
    if (env.API_KEYS) {
      const record = await env.API_KEYS.get(apiKey);
      if (!record) {
        return json({ error: 'Invalid API key', code: 'UNAUTHORIZED' }, 401);
      }
    }
    if (env.RL_KEY) {
      const { success } = await env.RL_KEY.limit({ key: apiKey });
      if (!success) return rateLimited(60);
    }
    return null;
  }

  // Anonym: pro Client-IP begrenzen.
  if (env.RL_ANON) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RL_ANON.limit({ key: ip });
    if (!success) return rateLimited(60);
  }
  return null;
}

function rateLimited(retryAfterSeconds) {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded. Add an API key (header X-API-Key) for a higher limit.',
      code: 'RATE_LIMITED',
    }),
    {
      status: 429,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSeconds) },
    }
  );
}

/**
 * GET /v1/point?lat=<>&lon=<>
 */
async function handlePoint(url, env) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));

  if (!isFinite(lat) || !isFinite(lon)) {
    throw apiError('Query params "lat" and "lon" required (decimal degrees, WGS84)', 400, 'BAD_REQUEST');
  }
  checkLatLon(lat, lon, 'lat/lon');

  const { zone, x, y } = wgs84ToUtm(lat, lon);
  const cache = new Map();
  const elevation = await bilinearElevation(zone, x, y, env, cache);

  if (elevation === null) {
    throw apiError('No elevation data for these coordinates (outside covered tiles)', 404, 'OUT_OF_COVERAGE');
  }

  return json({
    lat,
    lon,
    elevation: Math.round(elevation * 100) / 100,
    unit: 'm',
    source: 'DOM Deutschland (1 m)',
    resolution_m: 1,
  });
}

/**
 * GET /v1/profile?from=<lat,lon>&to=<lat,lon>&samples=<n>
 */
async function handleProfile(url, env) {
  const from = parseLatLon(url.searchParams.get('from'), 'from');
  const to = parseLatLon(url.searchParams.get('to'), 'to');
  const samples = parseSamples(url.searchParams.get('samples'));

  const { profile, distance } = await buildProfile(from, to, samples, env);

  return json({
    from: { lat: from.lat, lon: from.lon },
    to: { lat: to.lat, lon: to.lon },
    distance_m: round2(distance),
    samples,
    unit: 'm',
    source: 'DOM Deutschland (1 m)',
    profile: profile.map((p) => ({
      lat: round6(p.lat),
      lon: round6(p.lon),
      distance_m: round2(p.distance_m),
      elevation: p.elevation === null ? null : round2(p.elevation),
    })),
  });
}

/**
 * GET /v1/line-of-sight?observer=<lat,lon[,h]>&target=<lat,lon[,h]>&samples=<n>
 *
 * Portierung von js/visibility-calculator.js: Sichtlinie von der Augenhöhe
 * des Beobachters zur Oberkante des Ziels; jeder Geländepunkt wird auf
 * Überhöhung geprüft.
 */
async function handleLineOfSight(url, env) {
  const obs = parseCoordWithHeight(url.searchParams.get('observer'), 'observer', EYE_HEIGHT);
  const tgt = parseCoordWithHeight(url.searchParams.get('target'), 'target', 0);
  const samples = parseSamples(url.searchParams.get('samples'));

  const { profile, distance } = await buildProfile(obs, tgt, samples, env);

  const groundObs = profile[0].elevation;
  const groundTgt = profile[profile.length - 1].elevation;
  if (groundObs === null || groundTgt === null) {
    throw apiError('Observer or target ground point has no elevation data (outside coverage)', 404, 'OUT_OF_COVERAGE');
  }

  const eyeElevation = groundObs + obs.h;
  const targetTop = groundTgt + tgt.h;

  // Steilster Sichtwinkel (als Tangens = Höhe/Distanz) zu einem Geländepunkt
  // zwischen Beobachter und Ziel. Dieser "grazing angle" bestimmt, bis zu
  // welcher Höhe am Ziel die Sicht verdeckt ist: Ein nahes hohes Hindernis
  // (z.B. Haus 1,7 m vor dem Auge) erzeugt einen großen Winkel und verdeckt
  // damit auch weit entferntes, tieferliegendes Gelände/Objekt.
  let maxSlope = -Infinity;
  let blockPoint = null;
  for (let i = 1; i < profile.length - 1; i++) {
    const terrain = profile[i].elevation;
    if (terrain === null) continue;
    const s = (terrain - eyeElevation) / profile[i].distance_m;
    if (s > maxSlope) { maxSlope = s; blockPoint = profile[i]; }
  }

  // Höhe (ü.NN) auf der Ziel-Säule, bis zu der verdeckt ist.
  const blockedUpto = maxSlope === -Infinity ? -Infinity : eyeElevation + maxSlope * distance;

  let visibleHeight, visiblePercent, status, blockedAt = null;
  if (blockedUpto <= groundTgt) {
    // Sichtlinie verläuft unter der Zielbasis → Ziel vollständig sichtbar.
    visibleHeight = tgt.h;
    visiblePercent = 100;
    status = 'visible';
  } else {
    const visibleFrom = Math.min(blockedUpto, targetTop);
    visibleHeight = Math.max(0, targetTop - visibleFrom);
    visiblePercent = tgt.h > 0 ? (visibleHeight / tgt.h) * 100 : 0;
    status = visiblePercent < BLOCKED_THRESHOLD ? 'blocked'
      : visiblePercent < PARTIAL_THRESHOLD ? 'partial' : 'visible';
    blockedAt = {
      lat: round6(blockPoint.lat),
      lon: round6(blockPoint.lon),
      elevation: round2(blockPoint.elevation),
      distance_m: round2(blockPoint.distance_m),
    };
  }

  return json({
    visible: status === 'visible',   // Zielspitze ungehindert sichtbar
    status,                          // visible | partial | blocked
    visiblePercent: round2(visiblePercent),
    visibleHeight_m: round2(visibleHeight),
    blockedAt,                       // stärkster Verdeckungspunkt oder null
    observer: {
      lat: obs.lat, lon: obs.lon,
      groundElevation_m: round2(groundObs),
      height_m: obs.h,
      eyeElevation_m: round2(eyeElevation),
    },
    target: {
      lat: tgt.lat, lon: tgt.lon,
      groundElevation_m: round2(groundTgt),
      height_m: tgt.h,
      topElevation_m: round2(targetTop),
    },
    distance_m: round2(distance),
    samples,
    source: 'DOM Deutschland (1 m)',
  });
}

/**
 * GET /v1/viewshed?observer=<lat,lon[,h]>&radius=<m>&rays=<n>&step=<m>&targetHeight=<m>
 *
 * Sichtbarkeitsfächer: von einem Standort aus Strahlen in alle Richtungen.
 * Entlang jedes Strahls ist ein Punkt sichtbar, solange sein Höhenwinkel den
 * bisher größten Höhenwinkel (näheres Gelände) übersteigt. Liefert pro Richtung
 * die sichtbaren Distanz-Intervalle [from,to] in Metern.
 */
async function handleViewshed(url, env) {
  const obs = parseCoordWithHeight(url.searchParams.get('observer'), 'observer', EYE_HEIGHT);
  const radius = clampNum(url.searchParams.get('radius'), 2500, 100, 5000, 'radius');
  const rays = Math.round(clampNum(url.searchParams.get('rays'), 72, 8, 360, 'rays'));
  const step = clampNum(url.searchParams.get('step'), 25, 10, 200, 'step');
  const targetHeight = clampNum(url.searchParams.get('targetHeight'), 0, 0, 500, 'targetHeight');

  const stepsPerRay = Math.floor(radius / step);
  if (rays * stepsPerRay > 40000) {
    throw apiError('Too many samples (rays × radius/step > 40000). Reduce radius/rays or increase step.', 400, 'BAD_REQUEST');
  }

  const cache = new Map();
  const { zone, x, y } = wgs84ToUtm(obs.lat, obs.lon);
  const ground = await bilinearElevation(zone, x, y, env, cache);
  if (ground === null) {
    throw apiError('Observer has no elevation data (outside coverage)', 404, 'OUT_OF_COVERAGE');
  }
  const eye = ground + obs.h;

  const directions = [];
  for (let r = 0; r < rays; r++) {
    const bearing = (360 / rays) * r;
    let maxAng = -Infinity;
    const visible = [];
    let segStart = null;

    for (let d = step; d <= radius; d += step) {
      const p = destPoint(obs.lat, obs.lon, bearing, d);
      const u = wgs84ToUtm(p.lat, p.lon);
      const terr = await bilinearElevation(u.zone, u.x, u.y, env, cache);

      let isVisible = false;
      if (terr !== null) {
        const terrAng = Math.atan2((terr + targetHeight) - eye, d);
        isVisible = terrAng >= maxAng;
        const blockAng = Math.atan2(terr - eye, d); // Gelände selbst verdeckt
        if (blockAng > maxAng) maxAng = blockAng;
      }

      if (isVisible) {
        if (segStart === null) segStart = d;
      } else if (segStart !== null) {
        visible.push([segStart, d - step]);
        segStart = null;
      }
    }
    if (segStart !== null) visible.push([segStart, radius]);
    directions.push({ bearing: round2(bearing), visible });
  }

  return json({
    observer: { lat: obs.lat, lon: obs.lon, groundElevation_m: round2(ground), height_m: obs.h, eyeElevation_m: round2(eye) },
    radius_m: radius, rays, step_m: step, targetHeight_m: targetHeight,
    directions,
    source: 'DOM Deutschland (1 m)',
  });
}

/**
 * Baut ein Höhenprofil zwischen zwei Punkten (linear in lat/lon interpoliert,
 * Distanz geodätisch). Liefert { profile[], distance } mit distance in Metern.
 */
/**
 * GET /v1/slope?bbox=<minLat,minLon,maxLat,maxLon>&window=<m>&limit=<%>&model=<dgm|dom>&step=<m>
 *
 * Gefälle-Raster über eine (kleine) Fläche: je Rasterpunkt die stärkste Neigung
 * über die Basislänge `window` (Zentraldifferenz in X/Y), in Prozent.
 * Für Aufstellflächen, z.B. MRT: max. 3 % auf 10 m.
 *
 * Standardmodell ist **DGM** (Gelände). DOM enthält Bewuchs/Bebauung und ist für
 * Aufstellflächen irreführend — nur per model=dom erzwingbar.
 */
async function handleSlope(url, env) {
  const raw = url.searchParams.get('bbox');
  if (!raw) throw apiError('Query param "bbox" required as "minLat,minLon,maxLat,maxLon"', 400, 'BAD_REQUEST');
  const p = raw.split(',').map((s) => parseFloat(s.trim()));
  if (p.length !== 4 || p.some((v) => !isFinite(v))) {
    throw apiError('Invalid "bbox": expected "minLat,minLon,maxLat,maxLon"', 400, 'BAD_REQUEST');
  }
  const south = Math.min(p[0], p[2]), north = Math.max(p[0], p[2]);
  const west = Math.min(p[1], p[3]), east = Math.max(p[1], p[3]);
  checkLatLon(south, west, 'bbox');
  checkLatLon(north, east, 'bbox');

  const model = (url.searchParams.get('model') || 'dgm').toLowerCase() === 'dom' ? 'dom' : 'dgm';
  const windowM = clampNum(url.searchParams.get('window'), 10, 2, 100, 'window');
  const limitPct = clampNum(url.searchParams.get('limit'), 3, 0.1, 100, 'limit');
  const step = Math.round(clampNum(url.searchParams.get('step'), 1, 1, 10, 'step'));

  // Kleine Fläche -> Zone aus der Mitte; Ecken nach UTM für das Raster.
  const zone = wgs84ToUtm((south + north) / 2, (west + east) / 2).zone;
  const corners = [
    wgs84ToUtm(south, west), wgs84ToUtm(south, east),
    wgs84ToUtm(north, west), wgs84ToUtm(north, east),
  ];
  const x0 = Math.floor(Math.min(...corners.map((o) => o.x)));
  const x1 = Math.ceil(Math.max(...corners.map((o) => o.x)));
  const y0 = Math.floor(Math.min(...corners.map((o) => o.y)));
  const y1 = Math.ceil(Math.max(...corners.map((o) => o.y)));
  const cols = Math.floor((x1 - x0) / step) + 1;
  const rows = Math.floor((y1 - y0) / step) + 1;
  if (cols * rows > 40000) {
    throw apiError(`Area too large: ${cols}x${rows} cells (max 40000) — reduce bbox or raise step`, 400, 'AREA_TOO_LARGE');
  }

  const cache = new Map();
  const h = windowM / 2;
  const slope = new Array(cols * rows).fill(null);
  let ok = 0, over = 0, nodata = 0, maxS = 0, sum = 0;

  for (let r = 0; r < rows; r++) {
    const y = y0 + r * step;
    const rowVals = await Promise.all(Array.from({ length: cols }, async (_, cx) => {
      const x = x0 + cx * step;
      const [xm, xp, ym, yp] = await Promise.all([
        cellElevation(zone, Math.round(x - h), Math.round(y), env, cache, model),
        cellElevation(zone, Math.round(x + h), Math.round(y), env, cache, model),
        cellElevation(zone, Math.round(x), Math.round(y - h), env, cache, model),
        cellElevation(zone, Math.round(x), Math.round(y + h), env, cache, model),
      ]);
      if (xm === null || xp === null || ym === null || yp === null) return null;
      const dzdx = (xp - xm) / windowM;
      const dzdy = (yp - ym) / windowM;
      return Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
    }));
    rowVals.forEach((v, cx) => {
      if (v === null) { nodata++; return; }
      slope[r * cols + cx] = round2(v);
      sum += v; if (v > maxS) maxS = v;
      if (v <= limitPct) ok++; else over++;
    });
  }

  const counted = ok + over;
  return json({
    model,
    window_m: windowM,
    limit_percent: limitPct,
    step_m: step,
    grid: { cols, rows, zone, originUtm: { x: x0, y: y0 }, step_m: step },
    bounds: { south, west, north, east },
    slope_percent: slope, // row-major, Zeile 0 = Süden; null = keine Daten
    stats: {
      cells: cols * rows,
      evaluated: counted,
      nodata,
      ok_cells: ok,
      over_limit_cells: over,
      ok_percent: counted ? round2((ok / counted) * 100) : 0,
      max_percent: round2(maxS),
      mean_percent: counted ? round2(sum / counted) : null,
      suitable: counted > 0 && over === 0,
    },
    source: model === 'dgm' ? 'DGM Deutschland (1 m)' : 'DOM Deutschland (1 m)',
  });
}

async function buildProfile(from, to, samples, env) {
  const distance = haversine(from.lat, from.lon, to.lat, to.lon);
  const cache = new Map();
  const profile = [];

  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const lat = from.lat + (to.lat - from.lat) * t;
    const lon = from.lon + (to.lon - from.lon) * t;
    const { zone, x, y } = wgs84ToUtm(lat, lon);
    const elevation = await bilinearElevation(zone, x, y, env, cache);
    profile.push({ lat, lon, distance_m: distance * t, elevation });
  }

  return { profile, distance };
}

/**
 * Bilineare Interpolation der Höhe an einer UTM-Position (x, y in Metern).
 * Lädt für jede der 4 umliegenden Gridzellen die passende Kachel (über Cache).
 * Werte von 0 werden als "keine Daten" behandelt.
 */
async function bilinearElevation(zone, x, y, env, cache, model = 'dom') {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;

  const [h00, h10, h01, h11] = await Promise.all([
    cellElevation(zone, x0,     y0,     env, cache, model),
    cellElevation(zone, x0 + 1, y0,     env, cache, model),
    cellElevation(zone, x0,     y0 + 1, env, cache, model),
    cellElevation(zone, x0 + 1, y0 + 1, env, cache, model),
  ]);

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
async function cellElevation(zone, x, y, env, cache, model = 'dom') {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  const tile = await loadTile(zone, tileX, tileY, env, cache, model);
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
 *
 * Der Cache hält das Promise (nicht erst den aufgelösten Wert), damit
 * gleichzeitige Lookups derselben Kachel (z.B. die 4 bilinearen Ecken)
 * nur einen einzigen Fetch/R2-Get auslösen.
 */
function loadTile(zone, tileX, tileY, env, cache, model = 'dom') {
  // Präfix je Modell: DOM (Oberfläche) = tile_, DGM (Gelände) = dgm_.
  // Primärer Key mit Zonen-Präfix; für DOM/Zone 33 zusätzlich der Alt-Key ohne
  // Präfix (die ursprünglichen Brandenburg-Kacheln liegen als tile_x_y.bin).
  const prefix = model === 'dgm' ? 'dgm' : 'tile';
  const key = `${prefix}_${zone}_${tileX}_${tileY}.bin`;
  if (cache.has(key)) return cache.get(key);

  const candidates = (model !== 'dgm' && zone === 33)
    ? [key, `tile_${tileX}_${tileY}.bin`]
    : [key];

  const promise = (async () => {
    for (const k of candidates) {
      let buffer = null;

      // 1) Bevorzugt: R2-Binding
      if (env && env.TILES) {
        const obj = await env.TILES.get(k);
        if (obj) buffer = await obj.arrayBuffer();
      }
      // 2) Fallback: öffentliche R2-URL
      if (!buffer) {
        const resp = await fetch(`${PUBLIC_R2}/${k}`);
        if (resp.ok) buffer = await resp.arrayBuffer();
      }
      if (!buffer) continue;

      if (buffer.byteLength !== TILE_SIZE * TILE_SIZE * 2) {
        throw apiError(`Invalid tile size for ${k}: ${buffer.byteLength} bytes`, 500, 'BAD_TILE');
      }
      return new Uint16Array(buffer);
    }
    return null;
  })();

  cache.set(key, promise);
  return promise;
}

/**
 * WGS84 (lat/lon) → ETRS89/UTM, Zone 32N (EPSG:25832) oder 33N (EPSG:25833).
 *
 * Deutschland-Konvention: UTM32 westlich von 12°E, UTM33 östlich davon.
 * Liefert { zone, x, y }, damit Kacheln pro Zone (unterschiedliches Gitter)
 * korrekt adressiert werden. Vollständige Transverse-Mercator-Vorwärtsformel
 * (Snyder) inkl. Meridianbogen M; verifiziert gegen die Brandenburg-Kacheln.
 */
function wgs84ToUtm(lat, lon) {
  const zone = lon < 12 ? 32 : 33;
  const lon0deg = zone === 32 ? 9 : 15;   // Mittelmeridian der Zone

  const a = 6378137.0;                 // WGS84 große Halbachse
  const f = 1 / 298.257223563;         // Abplattung
  const e2 = f * (2 - f);              // erste Exzentrizität²
  const k0 = 0.9996;                   // Maßstabsfaktor
  const lon0 = (lon0deg * Math.PI) / 180;

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

  return { zone, x, y };
}

// ---- OpenAPI + Docs ----

/** Baut die OpenAPI-3.1-Spezifikation (server-URL dynamisch aus dem Request). */
function buildOpenApi(origin) {
  const apiKeyHeader = { name: 'X-API-Key', in: 'header', required: false, schema: { type: 'string' },
    description: 'Optionaler API-Key. Ohne Key: 30 Anfragen/60s pro IP. Mit gültigem Key: 600/60s.' };
  const errorSchema = { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } };
  const errorResponses = {
    400: { description: 'Ungültige Parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    401: { description: 'Ungültiger API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    404: { description: 'Außerhalb der Datenabdeckung', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    429: { description: 'Rate-Limit überschritten', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Elevation API',
      version: '1.0.0-mvp',
      description:
        'Höhendaten-Dienst auf Basis des Brandenburg-DOM (Airborne Laser Scanning, '
        + '1 m Auflösung, EPSG:25833). Punkt-Höhe, Höhenprofil und Sichtbarkeit/Line-of-Sight. '
        + 'Aktuelle Abdeckung: Region Neuhausen/Spree (Brandenburg).',
    },
    servers: [{ url: origin }],
    security: [{ ApiKeyAuth: [] }, {}],
    paths: {
      '/v1/point': {
        get: {
          summary: 'Höhe an einem Punkt',
          description: 'Bilinear interpolierte Geländehöhe (DOM, inkl. Vegetation/Gebäude) an einer Koordinate.',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' }, example: 51.6546, description: 'Breitengrad (WGS84)' },
            { name: 'lon', in: 'query', required: true, schema: { type: 'number' }, example: 14.4178, description: 'Längengrad (WGS84)' },
            apiKeyHeader,
          ],
          responses: {
            200: { description: 'Höhe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Point' } } } },
            ...errorResponses,
          },
        },
      },
      '/v1/profile': {
        get: {
          summary: 'Höhenprofil entlang einer Linie',
          parameters: [
            { name: 'from', in: 'query', required: true, schema: { type: 'string' }, example: '51.6546,14.4178', description: '"lat,lon" Start (WGS84)' },
            { name: 'to', in: 'query', required: true, schema: { type: 'string' }, example: '51.6711,14.4319', description: '"lat,lon" Ende (WGS84)' },
            { name: 'samples', in: 'query', required: false, schema: { type: 'integer', minimum: 2, maximum: 1000, default: 200 }, description: 'Anzahl Stützpunkte' },
            apiKeyHeader,
          ],
          responses: {
            200: { description: 'Profil', content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } } },
            ...errorResponses,
          },
        },
      },
      '/v1/line-of-sight': {
        get: {
          summary: 'Sichtbarkeit / Line-of-Sight',
          description:
            'Prüft, ob ein Ziel (z.B. Windrad-Oberkante) vom Beobachter aus über das Gelände sichtbar ist, '
            + 'und liefert den sichtbaren Anteil. Höhen jeweils als 3. Wert "lat,lon,höhe" (m über Grund).',
          parameters: [
            { name: 'observer', in: 'query', required: true, schema: { type: 'string' }, example: '51.6546,14.4178,1.7', description: '"lat,lon[,höhe]" Beobachter (Default Augenhöhe 1.7 m)' },
            { name: 'target', in: 'query', required: true, schema: { type: 'string' }, example: '51.7639,14.4932,250', description: '"lat,lon[,höhe]" Ziel (Default Höhe 0 m)' },
            { name: 'samples', in: 'query', required: false, schema: { type: 'integer', minimum: 2, maximum: 1000, default: 200 } },
            apiKeyHeader,
          ],
          responses: {
            200: { description: 'Sichtbarkeit', content: { 'application/json': { schema: { $ref: '#/components/schemas/LineOfSight' } } } },
            ...errorResponses,
          },
        },
      },
      '/v1/viewshed': {
        get: {
          summary: 'Sichtweite / Viewshed',
          description:
            'Sichtbarkeitsfächer von einem Standort: pro Richtung die sichtbaren '
            + 'Distanz-Intervalle. Rechnet auf dem DOM (inkl. Bewuchs). Compute-intensiv.',
          parameters: [
            { name: 'observer', in: 'query', required: true, schema: { type: 'string' }, example: '51.6546,14.4178,1.7', description: '"lat,lon[,höhe]" Standort' },
            { name: 'radius', in: 'query', required: false, schema: { type: 'integer', default: 2500, maximum: 5000 }, description: 'Radius in Metern' },
            { name: 'rays', in: 'query', required: false, schema: { type: 'integer', default: 72, maximum: 360 }, description: 'Anzahl Richtungen' },
            { name: 'step', in: 'query', required: false, schema: { type: 'integer', default: 25, minimum: 10 }, description: 'Schrittweite in Metern' },
            { name: 'targetHeight', in: 'query', required: false, schema: { type: 'number', default: 0 }, description: 'Zielhöhe über Grund (m)' },
            apiKeyHeader,
          ],
          responses: {
            200: { description: 'Sichtweite', content: { 'application/json': { schema: { type: 'object' } } } },
            ...errorResponses,
          },
        },
      },
      '/v1/health': {
        get: { summary: 'Liveness-Check', security: [{}], responses: { 200: { description: 'OK' } } },
      },
    },
    components: {
      securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
      schemas: {
        Error: errorSchema,
        Point: {
          type: 'object',
          properties: {
            lat: { type: 'number' }, lon: { type: 'number' },
            elevation: { type: 'number', description: 'Höhe in Metern' },
            unit: { type: 'string', example: 'm' },
            source: { type: 'string' }, resolution_m: { type: 'number', example: 1 },
          },
        },
        Profile: {
          type: 'object',
          properties: {
            from: { type: 'object' }, to: { type: 'object' },
            distance_m: { type: 'number' }, samples: { type: 'integer' },
            unit: { type: 'string' }, source: { type: 'string' },
            profile: {
              type: 'array',
              items: { type: 'object', properties: {
                lat: { type: 'number' }, lon: { type: 'number' },
                distance_m: { type: 'number' }, elevation: { type: ['number', 'null'] },
              } },
            },
          },
        },
        LineOfSight: {
          type: 'object',
          properties: {
            visible: { type: 'boolean', description: 'Zielspitze ungehindert sichtbar' },
            status: { type: 'string', enum: ['visible', 'partial', 'blocked'] },
            visiblePercent: { type: 'number' },
            visibleHeight_m: { type: 'number' },
            blockedAt: { type: ['object', 'null'], properties: {
              lat: { type: 'number' }, lon: { type: 'number' },
              elevation: { type: 'number' }, distance_m: { type: 'number' } } },
            observer: { type: 'object' }, target: { type: 'object' },
            distance_m: { type: 'number' }, samples: { type: 'integer' }, source: { type: 'string' },
          },
        },
      },
    },
  };
}

/** Doku-Seite (Redoc, lädt /openapi.json). */
const DOCS_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Elevation API — Doku</title>
  <style>body { margin: 0; }</style>
</head>
<body>
  <redoc spec-url="/openapi.json"></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

/** Interaktive Test-/Demo-Seite (Leaflet): Punkt-Höhe & Line-of-Sight per Klick. */
const DEMO_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Elevation API — Demo</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a2433; }
  header { padding: 10px 16px; background: #0b3b44; color: #fff; }
  header h1 { font-size: 16px; margin: 0; }
  header a { color: #9fe4d0; font-size: 13px; }
  #wrap { display: flex; height: calc(100vh - 44px); }
  #map { flex: 1; }
  #side { width: 340px; padding: 14px; overflow-y: auto; border-left: 1px solid #ddd; }
  fieldset { border: 1px solid #ddd; border-radius: 6px; margin: 0 0 12px; padding: 8px 10px; }
  legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
  label { font-size: 13px; display: block; margin: 6px 0 2px; }
  input { width: 100%; padding: 5px; font-size: 13px; }
  .mode { display: flex; gap: 6px; margin-bottom: 8px; }
  .mode button { flex: 1; padding: 8px; border: 1px solid #0b3b44; background: #fff; color: #0b3b44; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .mode button.active { background: #0b3b44; color: #fff; }
  #result { font-size: 13px; line-height: 1.5; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; color: #fff; font-weight: 600; }
  .visible { background: #2e9e5b; } .partial { background: #e08e00; } .blocked { background: #d23b3b; }
  #hint { font-size: 12px; color: #666; }
  canvas { width: 100%; height: 150px; border: 1px solid #eee; margin-top: 8px; }
  button.reset { width: 100%; padding: 7px; margin-top: 6px; cursor: pointer; }
</style>
</head>
<body>
<header><h1>Elevation API — Demo &nbsp;·&nbsp; <a href="/docs">API-Doku</a></h1></header>
<div id="wrap">
  <div id="map"></div>
  <div id="side">
    <div class="mode">
      <button id="mPoint" class="active">Höhe</button>
      <button id="mLos">Sichtlinie</button>
      <button id="mView">Sichtweite</button>
    </div>
    <p id="hint">Klicke auf die Karte, um die Höhe an einem Punkt abzufragen.</p>
    <fieldset>
      <legend>Parameter</legend>
      <label>Punkt A (Beobachter) — Höhe (m über Grund)</label>
      <input id="obsH" type="number" value="1.7" step="0.1"/>
      <label>Punkt B (Ziel) — Höhe (m, z.B. Windrad)</label>
      <input id="tgtH" type="number" value="250" step="1"/>
      <label>Sichtweite-Radius (m, nur Modus „Sichtweite")</label>
      <input id="vsR" type="number" value="2500" step="100"/>
      <label>API-Key (optional)</label>
      <input id="apiKey" type="text" placeholder="leer = anonym (30/min)"/>
    </fieldset>
    <fieldset>
      <legend>Ergebnis</legend>
      <div id="result">—</div>
    </fieldset>
    <fieldset>
      <legend>Geländeschnitt A → B</legend>
      <canvas id="profile" width="320" height="180"></canvas>
      <p id="hint" style="margin:4px 0 0">Höhen oben editierbar — der Schnitt aktualisiert sich live.</p>
    </fieldset>
    <button class="reset" id="reset">Zurücksetzen</button>
  </div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map').setView([51.6724, 14.4354], 12);
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap, © OpenTopoMap', maxZoom: 17 }).addTo(map);

let mode = 'point';
let observer = null, target = null;
let layers = [];          // Punkt-Modus-Marker
let baseMarkers = [];     // A/B-Marker (LoS)
let losLayers = [];       // Sichtlinie + Verdeckungspunkt (bei Neuberechnung ersetzt)
const $ = (id) => document.getElementById(id);
const hints = {
  point: 'Klicke auf die Karte, um die Höhe an einem Punkt abzufragen.',
  los: 'Klick 1 = Beobachter, Klick 2 = Ziel. Dann wird die Sichtbarkeit berechnet.',
  view: 'Klicke auf deinen Standort. Der grüne Fächer zeigt, was du von dort noch siehst (DOM, inkl. Bewuchs — Höhe oben anpassbar).'
};
function setMode(m){ mode=m; observer=null; target=null; clear();
  $('mPoint').classList.toggle('active', m==='point');
  $('mLos').classList.toggle('active', m==='los');
  $('mView').classList.toggle('active', m==='view');
  $('hint').textContent = hints[m]; $('result').textContent='—'; }
$('mPoint').onclick=()=>setMode('point');
$('mLos').onclick=()=>setMode('los');
$('mView').onclick=()=>setMode('view');
$('reset').onclick=()=>{ observer=null; target=null; clear(); $('result').textContent='—'; };
function clear(){ [layers,baseMarkers,losLayers].forEach(g=>g.forEach(l=>map.removeLayer(l)));
  layers=[]; baseMarkers=[]; losLayers=[];
  const c=$('profile').getContext('2d'); c.clearRect(0,0,1000,1000); }
function headers(){ const k=$('apiKey').value.trim(); return k?{'X-API-Key':k}:{}; }
function colorFor(s){ return s==='visible'?'#2e9e5b':s==='partial'?'#e08e00':'#d23b3b'; }

map.on('click', async (e)=>{
  const {lat, lng} = e.latlng;
  if (mode==='point'){
    try{
      const r = await fetch('/v1/point?lat='+lat+'&lon='+lng,{headers:headers()});
      const d = await r.json();
      if(!r.ok){ $('result').innerHTML='<b>Fehler:</b> '+(d.error||r.status); return; }
      const m=L.marker([lat,lng]).addTo(map).bindPopup(d.elevation+' m').openPopup();
      layers.push(m);
      $('result').innerHTML='Höhe: <b>'+d.elevation+' m</b><br><small>'+lat.toFixed(5)+', '+lng.toFixed(5)+'</small>';
    }catch(err){ $('result').textContent='Netzwerkfehler'; }
    return;
  }
  if (mode==='view'){
    observer=[lat,lng]; target=null; clear();
    baseMarkers.push(L.marker(observer).addTo(map).bindTooltip('Standort',{permanent:true}));
    await runViewshed(); return;
  }
  // LoS-Modus: A → B; nach vollständigem Paar startet der nächste Klick neu.
  if(!observer || (observer && target)){
    observer=[lat,lng]; target=null; clear();
    baseMarkers.push(L.marker(observer).addTo(map).bindTooltip('A',{permanent:true}));
    $('result').textContent='Punkt A gesetzt. Jetzt Punkt B klicken.'; return;
  }
  if(!target){ target=[lat,lng];
    baseMarkers.push(L.marker(target).addTo(map).bindTooltip('B',{permanent:true}));
    await runLos(); return; }
});

// Live-Neuberechnung bei Parameter-Änderung.
$('obsH').oninput = ()=>{ if(mode==='los'&&observer&&target) runLos(); else if(mode==='view'&&observer) runViewshed(); };
$('tgtH').oninput = ()=>{ if(mode==='los'&&observer&&target) runLos(); };
$('vsR').oninput  = ()=>{ if(mode==='view'&&observer) runViewshed(); };

// Geodätischer Zielpunkt (sphärisch) für die Fächer-Darstellung.
function dest(lat,lon,brDeg,dist){
  const R=6371000, br=brDeg*Math.PI/180, p1=lat*Math.PI/180, l1=lon*Math.PI/180, dr=dist/R;
  const p2=Math.asin(Math.sin(p1)*Math.cos(dr)+Math.cos(p1)*Math.sin(dr)*Math.cos(br));
  const l2=l1+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(p1),Math.cos(dr)-Math.sin(p1)*Math.sin(p2));
  return [p2*180/Math.PI, l2*180/Math.PI];
}

async function runViewshed(){
  const h=$('obsH').value||1.7, radius=$('vsR').value||2500;
  try{
    const r=await fetch('/v1/viewshed?observer='+observer[0]+','+observer[1]+','+h+'&radius='+radius+'&rays=60&step=25',{headers:headers()});
    const d=await r.json();
    if(!r.ok){ $('result').innerHTML='<b>Fehler:</b> '+(d.error||r.status); return; }
    losLayers.forEach(l=>map.removeLayer(l)); losLayers=[];
    losLayers.push(L.circle(observer,{radius:d.radius_m,color:'#888',weight:1,fill:false,dashArray:'4'}).addTo(map));
    let total=0, maxd=0;
    d.directions.forEach(dir=>dir.visible.forEach(([a,b])=>{
      total+=b-a; if(b>maxd) maxd=b;
      losLayers.push(L.polyline([dest(observer[0],observer[1],dir.bearing,a),dest(observer[0],observer[1],dir.bearing,b)],
        {color:'#2e9e5b',weight:3,opacity:.6}).addTo(map));
    }));
    $('result').innerHTML='Standort: Augenhöhe '+d.observer.height_m+' m über Grund ('
      +'<b>'+d.observer.eyeElevation_m+' m</b> ü.NN)<br>'
      +'max. Sichtweite: <b>'+maxd+' m</b><br>'
      +'sichtbare Strecke gesamt: '+Math.round(total)+' m<br>'
      +'<small>DOM inkl. Bewuchs — Höhe oben erhöhen für mehr Weite.</small>';
  }catch(err){ $('result').textContent='Netzwerkfehler'; }
}

async function runLos(){
  const oH=$('obsH').value||0, tH=$('tgtH').value||0;
  const o=observer[0]+','+observer[1]+','+oH, t=target[0]+','+target[1]+','+tH;
  try{
    const r = await fetch('/v1/line-of-sight?observer='+o+'&target='+t+'&samples=200',{headers:headers()});
    const d = await r.json();
    if(!r.ok){ $('result').innerHTML='<b>Fehler:</b> '+(d.error||r.status); return; }
    losLayers.forEach(l=>map.removeLayer(l)); losLayers=[];
    const col=colorFor(d.status);
    losLayers.push(L.polyline([observer,target],{color:col,weight:4}).addTo(map));
    if(d.blockedAt){ losLayers.push(L.circleMarker([d.blockedAt.lat,d.blockedAt.lon],
      {radius:6,color:'#d23b3b',fillColor:'#d23b3b',fillOpacity:1}).addTo(map).bindTooltip('Verdeckung')); }
    $('result').innerHTML='<span class="badge '+d.status+'">'+d.status.toUpperCase()+'</span> '
      +'<b>'+d.visiblePercent+'%</b> sichtbar<br>'
      +'sichtbare Höhe: '+d.visibleHeight_m+' m / '+d.target.height_m+' m<br>'
      +'Distanz: '+(d.distance_m/1000).toFixed(2)+' km'
      +(d.blockedAt?'<br>Verdeckung bei '+Math.round(d.blockedAt.distance_m)+' m':'');
    drawProfile(d);
  }catch(err){ $('result').textContent='Netzwerkfehler'; }
}

// Geländeschnitt (Seitenansicht A → B) mit Masten an A/B und Sichtlinie.
async function drawProfile(los){
  const r=await fetch('/v1/profile?from='+observer.join(',')+'&to='+target.join(',')+'&samples=200',{headers:headers()});
  const d=await r.json(); if(!r.ok) return;
  const cv=$('profile'), ctx=cv.getContext('2d'); const W=cv.width,H=cv.height,pad=24,n=d.profile.length;
  ctx.clearRect(0,0,W,H);
  const els=d.profile.map(p=>p.elevation).filter(v=>v!=null);
  const gA=los.observer.groundElevation_m, gB=los.target.groundElevation_m;
  const eye=los.observer.eyeElevation_m, top=los.target.topElevation_m;
  const min=Math.min(...els), max=Math.max(top,...els), rng=(max-min)||1;
  const sx=i=>pad+i/(n-1)*(W-2*pad);
  const sy=v=>H-pad-(v-min)/rng*(H-2*pad);
  const valAt=i=>d.profile[i].elevation==null?min:d.profile[i].elevation;
  // Gelände (Fläche + Linie)
  ctx.beginPath(); ctx.moveTo(sx(0),sy(valAt(0)));
  for(let i=1;i<n;i++) ctx.lineTo(sx(i),sy(valAt(i)));
  ctx.lineTo(sx(n-1),H-pad); ctx.lineTo(sx(0),H-pad); ctx.closePath();
  ctx.fillStyle='rgba(121,85,72,.25)'; ctx.fill();
  ctx.strokeStyle='#795548'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(sx(0),sy(valAt(0)));
  for(let i=1;i<n;i++) ctx.lineTo(sx(i),sy(valAt(i))); ctx.stroke();
  // Mast A (Beobachter) und Mast B (Ziel)
  ctx.lineWidth=3;
  ctx.strokeStyle='#2563eb'; ctx.beginPath(); ctx.moveTo(sx(0),sy(gA)); ctx.lineTo(sx(0),sy(eye)); ctx.stroke();
  ctx.strokeStyle='#0b8f6a'; ctx.beginPath(); ctx.moveTo(sx(n-1),sy(gB)); ctx.lineTo(sx(n-1),sy(top)); ctx.stroke();
  // Sichtlinie A-Auge → B-Spitze
  ctx.strokeStyle=colorFor(los.status); ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.beginPath();
  ctx.moveTo(sx(0),sy(eye)); ctx.lineTo(sx(n-1),sy(top)); ctx.stroke(); ctx.setLineDash([]);
  // Verdeckungspunkt
  if(los.blockedAt){ const bi=Math.round(los.blockedAt.distance_m/los.distance_m*(n-1));
    ctx.fillStyle='#d23b3b'; ctx.beginPath(); ctx.arc(sx(bi),sy(los.blockedAt.elevation),4,0,7); ctx.fill(); }
  // Labels
  ctx.fillStyle='#666'; ctx.font='10px sans-serif'; ctx.textAlign='left';
  ctx.fillText(Math.round(max)+'m',2,12); ctx.fillText(Math.round(min)+'m',2,H-pad+11);
  ctx.fillStyle='#2563eb'; ctx.fillText('A '+Math.round(eye)+'m',sx(0),H-6);
  ctx.fillStyle='#0b8f6a'; ctx.textAlign='right'; ctx.fillText(Math.round(top)+'m B',sx(n-1),H-6); ctx.textAlign='left';
}
</script>
</body>
</html>`;

// =====================================================================
//  Losspinne — LoS-/Richtfunk-Planung zwischen Standorten (POC).
//  Nutzer setzt einen Punkt -> nahe Standorte im Radius werden gesucht ->
//  je Standort eine Sichtlinie (grün frei / orange+rot kritisch) ->
//  Klick auf Linie -> DOM-Oberflächenprofil zwischen den Standorten.
//  Standorte: OSM (ODbL) via /losspinne/sites.json. Same-origin zu /v1/*.
// =====================================================================
const LOSSPINNE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Losspinne — Sichtverbindungs-Planung</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a2433; }
  header { padding: 10px 16px; background: #0b3b44; color: #fff; }
  header h1 { font-size: 16px; margin: 0; }
  header a { color: #9fe4d0; font-size: 13px; text-decoration: none; }
  #wrap { display: flex; height: calc(100vh - 44px); }
  #map { flex: 1; }
  #side { width: 370px; padding: 14px; overflow-y: auto; border-left: 1px solid #ddd; }
  fieldset { border: 1px solid #ddd; border-radius: 6px; margin: 0 0 12px; padding: 8px 10px; }
  legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
  label { font-size: 13px; display: block; margin: 6px 0 2px; }
  input[type=number], input[type=text] { width: 100%; padding: 5px; font-size: 13px; }
  input[type=range] { width: 100%; }
  .hint { font-size: 12px; color: #666; margin: 4px 0; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; color: #fff; font-weight: 600; font-size: 12px; }
  .frei { background: #2e9e5b; } .teil { background: #e08e00; } .krit { background: #d23b3b; } .err { background: #888; }
  .line-item { cursor: pointer; padding: 3px 5px; border-radius: 4px; display: flex; justify-content: space-between; gap: 6px; align-items: center; }
  .line-item:hover { background: #f2f7f6; }
  .line-item.sel { background: #dcefe9; }
  #details { font-size: 13px; line-height: 1.5; }
  canvas { width: 100%; height: 170px; border: 1px solid #eee; margin-top: 8px; }
  button.reset { width: 100%; padding: 7px; margin-top: 6px; cursor: pointer; }
  .rowflex { display: flex; gap: 8px; }
  .rowflex > div { flex: 1; }
  #sum { font-weight: 600; font-size: 13px; }
  button.primary { width:100%; padding:9px; margin:8px 0 0; cursor:pointer; background:#0b3b44; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:600; }
  button.primary:disabled { background:#9db4b8; cursor:default; }
  button.small { padding:3px 8px; font-size:12px; cursor:pointer; border:1px solid #0b3b44; background:#fff; color:#0b3b44; border-radius:5px; }
  button.small:disabled { opacity:.4; cursor:default; }
  .prof-head { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
  #modal { position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:1000; }
  #modal.open { display:flex; }
  #modalBox { background:#fff; border-radius:8px; padding:14px; width:min(94vw,1100px); }
  #modalBox h3 { margin:0 0 8px; font-size:15px; display:flex; justify-content:space-between; align-items:center; }
  #bigProfile { width:100%; height:min(62vh,540px); border:1px solid #eee; }
  #modalClose { cursor:pointer; border:none; background:#0b3b44; color:#fff; border-radius:5px; padding:5px 12px; font-size:13px; }
</style>
</head>
<body>
<header><h1>Losspinne — Sichtverbindungs-Planung &nbsp;·&nbsp; <a href="/demo">Demo</a> &nbsp;<a href="/docs">API-Doku</a></h1></header>
<div id="wrap">
  <div id="map"></div>
  <div id="side">
    <p class="hint"><b>Klick auf die Karte</b> = neuer Standort. Zu jedem bestehenden Standort im Radius wird eine Sichtlinie berechnet: <span class="badge frei">frei</span> ungehindert, <span class="badge teil">teilw.</span> / <span class="badge krit">kritisch</span> verdeckt. Klick auf eine Linie zeigt das Geländeprofil.</p>
    <fieldset>
      <legend>Parameter</legend>
      <label>Suchradius: <span id="rLabel">10,0</span> km</label>
      <input id="radius" type="range" min="0.5" max="20" step="0.5" value="10"/>
      <div class="rowflex">
        <div>
          <label>Antennenhöhe (m)</label>
          <input id="antH" type="number" value="30" step="1"/>
        </div>
        <div>
          <label>max. Linien</label>
          <input id="maxN" type="number" value="25" step="1"/>
        </div>
      </div>
      <label>API-Key (optional, für viele Linien)</label>
      <input id="apiKey" type="text" placeholder="leer = anonym (30/min)"/>
    </fieldset>
    <fieldset>
      <legend>Neuer Standort</legend>
      <div id="np" class="hint">Noch nicht gesetzt — auf die Karte klicken.</div>
      <button id="calc" class="primary" disabled>Losspinne berechnen</button>
      <div id="sum" style="margin-top:6px"></div>
      <div id="lineList" style="margin-top:6px"></div>
    </fieldset>
    <fieldset>
      <legend>Ausgewählte Verbindung</legend>
      <div id="details">Klicke eine Linie (Karte oder Liste) für Details + Geländeprofil.</div>
      <div class="prof-head"><span class="hint">Geländeprofil</span><button id="enlarge" class="small" disabled>⤢ Vergrößern</button></div>
      <canvas id="profile" width="340" height="180"></canvas>
    </fieldset>
    <button class="reset" id="reset">Zurücksetzen</button>
    <p class="hint">Standorte: © OpenStreetMap-Mitwirkende (ODbL). Höhen: DOM Deutschland (1 m).</p>
  </div>
</div>
<div id="modal"><div id="modalBox"><h3><span id="modalTitle">Geländeprofil</span><button id="modalClose">Schließen</button></h3><canvas id="bigProfile"></canvas></div></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map').setView([51.722, 14.478], 12);
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap, © OpenTopoMap', maxZoom: 17 }).addTo(map);

const $ = (id) => document.getElementById(id);
function headers(){ const k=$('apiKey').value.trim(); return k?{'X-API-Key':k}:{}; }
function antH(){ const v=parseFloat($('antH').value); return isFinite(v)?v:30; }
function radiusM(){ return (parseFloat($('radius').value)||5)*1000; }
function maxN(){ const v=parseInt($('maxN').value,10); return isFinite(v)&&v>0?v:25; }
function statusClass(s){ return s==='visible'?'frei':s==='partial'?'teil':s==='blocked'?'krit':'err'; }
function statusLabel(s){ return s==='visible'?'frei':s==='partial'?'teilw.':s==='blocked'?'kritisch':'Fehler'; }
function colorFor(s){ return s==='visible'?'#2e9e5b':s==='partial'?'#e08e00':s==='blocked'?'#d23b3b':'#888'; }

// Haversine-Distanz (m)
function distM(aLat,aLon,bLat,bLon){
  const R=6371000, p=Math.PI/180;
  const dLat=(bLat-aLat)*p, dLon=(bLon-aLon)*p;
  const x=Math.sin(dLat/2)**2 + Math.cos(aLat*p)*Math.cos(bLat*p)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

let SITES=[], siteMarkers=[];
let newPoint=null, newMarker=null, radiusCircle=null;
let lines=[];          // {site, dist, pl, los}
let selected=null;
let computeSeq=0;      // gegen Race bei schnellem Radius-Schieben

// Standorte laden
fetch('/losspinne/sites.json',{headers:headers()}).then(r=>r.json()).then(s=>{
  SITES=s;
  SITES.forEach(t=>{
    const m=L.circleMarker([t.lat,t.lon],{radius:5,color:'#fff',weight:1.5,fillColor:'#0b3b44',fillOpacity:.9})
      .addTo(map).bindTooltip('Funkstandort '+t.id+(t.op?(' · '+t.op):'')+(t.h?(' · '+t.h+' m'):''));
    siteMarkers.push(m);
  });
  $('np').innerHTML='<span class="hint">'+SITES.length+' Funkstandorte geladen. Auf die Karte klicken.</span>';
  // Karte auf alle Standorte einpassen, damit nichts am Rand verschwindet.
  if(SITES.length){ map.fitBounds(SITES.map(t=>[t.lat,t.lon]), {padding:[40,40]}); }
});

map.on('click', e=> setNewPoint(e.latlng.lat, e.latlng.lng));
$('reset').onclick = resetAll;
$('calc').onclick = ()=>{ if(newPoint) computeSpider(); };
$('enlarge').onclick = openBigProfile;
$('modalClose').onclick = closeBigProfile;
$('modal').onclick = (e)=>{ if(e.target===$('modal')) closeBigProfile(); };
// Radius: nur Kreis/Label aktualisieren (keine Auto-Berechnung). Höhe/max. Linien greifen beim nächsten „Berechnen".
$('radius').oninput = ()=>{ $('rLabel').textContent=(parseFloat($('radius').value)).toFixed(1).replace('.',','); if(newPoint) drawRadius(); };

function setNewPoint(lat,lon){
  newPoint=[lat,lon];
  clearLines(); $('sum').innerHTML=''; $('lineList').innerHTML='';
  if(newMarker) map.removeLayer(newMarker);
  newMarker=L.marker(newPoint,{draggable:true}).addTo(map).bindTooltip('Neuer Standort (ziehbar)',{permanent:true,direction:'top'});
  newMarker.on('drag', e=>{ newPoint=[e.latlng.lat,e.latlng.lng]; drawRadius(); });
  newMarker.on('dragend', updateNpText);
  drawRadius(); updateNpText();
  $('calc').disabled=false;
}

function updateNpText(){
  $('np').innerHTML='Neuer Standort: <b>'+newPoint[0].toFixed(5)+', '+newPoint[1].toFixed(5)+'</b>'
    +'<br><span class="hint">Nadel ziehen zum Justieren, Radius/Höhe einstellen — dann <b>Berechnen</b>.</span>';
}

function drawRadius(){
  if(radiusCircle) map.removeLayer(radiusCircle);
  radiusCircle=L.circle(newPoint,{radius:radiusM(),color:'#0b3b44',weight:1,fill:false,dashArray:'5,6'}).addTo(map);
}

function clearLines(){ lines.forEach(l=>map.removeLayer(l.pl)); lines=[]; selected=null; }

// kleiner Concurrency-Pool, um Rate-Limit-Bursts zu vermeiden
async function pool(items, worker, size){
  const res=new Array(items.length); let i=0;
  async function run(){ while(i<items.length){ const idx=i++; res[idx]=await worker(items[idx],idx); } }
  await Promise.all(Array.from({length:Math.min(size,items.length)}, run));
  return res;
}

async function computeSpider(){
  const seq=++computeSeq;
  clearLines();
  const R=radiusM(), aH=antH();
  const near=SITES
    .map(s=>({s, dist:distM(newPoint[0],newPoint[1],s.lat,s.lon)}))
    .filter(o=>o.dist<=R && o.dist>1)
    .sort((a,b)=>a.dist-b.dist);
  const capped=near.slice(0,maxN());
  $('sum').innerHTML='… berechne '+capped.length+' Verbindung(en)'+(near.length>capped.length?(' (von '+near.length+', begrenzt)'):'');
  const results=await pool(capped, async (o)=>{
    const o1=newPoint[0]+','+newPoint[1]+','+aH;
    const tH=o.s.h||aH;
    const t1=o.s.lat+','+o.s.lon+','+tH;
    try{
      const r=await fetch('/v1/line-of-sight?observer='+o1+'&target='+t1+'&samples=200',{headers:headers()});
      const d=await r.json();
      return {site:o.s, dist:o.dist, los: r.ok?d:{status:undefined,error:d.error||('HTTP '+r.status)}};
    }catch(e){ return {site:o.s, dist:o.dist, los:{status:undefined,error:'Netzwerk'}}; }
  }, 5);
  if(seq!==computeSeq) return; // veraltet
  results.forEach(res=>{
    const col=colorFor(res.los.status);
    const pl=L.polyline([newPoint,[res.site.lat,res.site.lon]],
      {color:col,weight:3,opacity:.8,dashArray:res.los.status?null:'5,5'}).addTo(map);
    const line={site:res.site, dist:res.dist, pl, los:res.los};
    pl.on('click',()=>selectLine(line));
    lines.push(line);
  });
  renderSummary();
  $('calc').textContent='Neu berechnen';
}

function renderSummary(){
  const c={frei:0,teil:0,krit:0,err:0};
  lines.forEach(l=>{ const s=l.los.status; c[s==='visible'?'frei':s==='partial'?'teil':s==='blocked'?'krit':'err']++; });
  $('sum').innerHTML='<span class="badge frei">'+c.frei+' frei</span> '
    +'<span class="badge teil">'+c.teil+' teilw.</span> '
    +'<span class="badge krit">'+c.krit+' kritisch</span>'
    +(c.err?' <span class="badge err">'+c.err+'</span>':'');
  const box=$('lineList'); box.innerHTML='';
  lines.forEach(l=>{
    const row=document.createElement('div'); row.className='line-item';
    if(selected&&selected.pl===l.pl) row.classList.add('sel');
    const nm=l.site.op || l.site.id;
    const pct=l.los.status?(' '+l.los.visiblePercent+'%'):'';
    row.innerHTML='<span>'+nm+' · '+(l.dist/1000).toFixed(1)+' km</span>'
      +'<span class="badge '+statusClass(l.los.status)+'">'+statusLabel(l.los.status)+pct+'</span>';
    row.onclick=()=>selectLine(l);
    box.appendChild(row);
  });
}

async function selectLine(line){
  if(selected&&selected.pl) selected.pl.setStyle({weight:3});
  selected=line; line.pl.setStyle({weight:6});
  renderSummary();
  const los=line.los, s=line.site;
  const nm=s.op||s.id;
  if(!los.status){
    $('details').innerHTML='<b>'+nm+':</b> '+(los.error||'keine Höhendaten (außerhalb Abdeckung?)');
    $('profile').getContext('2d').clearRect(0,0,2000,2000);
    lastProfile=null; $('enlarge').disabled=true;
    return;
  }
  const krit = los.status!=='visible';
  $('details').innerHTML=
    'Neuer Standort → <b>'+nm+'</b>'+(s.h?(' (Mast '+s.h+' m)'):'')+'<br>'
    +'<span class="badge '+statusClass(los.status)+'">'+(krit?'KRITISCH':'FREI')+'</span> '
    +'<b>'+los.visiblePercent+'%</b> der Gegenantenne sichtbar<br>'
    +'Distanz: '+(los.distance_m/1000).toFixed(2)+' km'
    +(los.blockedAt?('<br>Verdeckung bei '+Math.round(los.blockedAt.distance_m)+' m'):'');
  await drawProfile(newPoint,[s.lat,s.lon],los);
}

// Geländeschnitt neuer Standort -> Zielstandort: einmal laden, in Klein- und Groß-Ansicht zeichnen.
let lastProfile=null;

async function drawProfile(fromArr,toArr,los){
  const r=await fetch('/v1/profile?from='+fromArr.join(',')+'&to='+toArr.join(',')+'&samples=200',{headers:headers()});
  const d=await r.json(); if(!r.ok){ lastProfile=null; $('enlarge').disabled=true; return; }
  lastProfile={data:d, los};
  drawProfileInto($('profile'), d, los);
  $('enlarge').disabled=false;
}

function drawProfileInto(cv, d, los){
  const ctx=cv.getContext('2d'); const W=cv.width,H=cv.height,pad=24,n=d.profile.length;
  ctx.clearRect(0,0,W,H);
  const els=d.profile.map(p=>p.elevation).filter(v=>v!=null);
  const gA=los.observer.groundElevation_m, gB=los.target.groundElevation_m;
  const eye=los.observer.eyeElevation_m, top=los.target.topElevation_m;
  const min=Math.min(...els), max=Math.max(top,...els), rng=(max-min)||1;
  const sx=i=>pad+i/(n-1)*(W-2*pad);
  const sy=v=>H-pad-(v-min)/rng*(H-2*pad);
  const valAt=i=>d.profile[i].elevation==null?min:d.profile[i].elevation;
  ctx.beginPath(); ctx.moveTo(sx(0),sy(valAt(0)));
  for(let i=1;i<n;i++) ctx.lineTo(sx(i),sy(valAt(i)));
  ctx.lineTo(sx(n-1),H-pad); ctx.lineTo(sx(0),H-pad); ctx.closePath();
  ctx.fillStyle='rgba(121,85,72,.25)'; ctx.fill();
  ctx.strokeStyle='#795548'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(sx(0),sy(valAt(0)));
  for(let i=1;i<n;i++) ctx.lineTo(sx(i),sy(valAt(i))); ctx.stroke();
  ctx.lineWidth=3;
  ctx.strokeStyle='#2563eb'; ctx.beginPath(); ctx.moveTo(sx(0),sy(gA)); ctx.lineTo(sx(0),sy(eye)); ctx.stroke();
  ctx.strokeStyle='#0b8f6a'; ctx.beginPath(); ctx.moveTo(sx(n-1),sy(gB)); ctx.lineTo(sx(n-1),sy(top)); ctx.stroke();
  ctx.strokeStyle=colorFor(los.status); ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.beginPath();
  ctx.moveTo(sx(0),sy(eye)); ctx.lineTo(sx(n-1),sy(top)); ctx.stroke(); ctx.setLineDash([]);
  if(los.blockedAt){ const bi=Math.round(los.blockedAt.distance_m/los.distance_m*(n-1));
    ctx.fillStyle='#d23b3b'; ctx.beginPath(); ctx.arc(sx(bi),sy(los.blockedAt.elevation),4,0,7); ctx.fill(); }
  const fs=Math.max(10,Math.round(H/16));
  ctx.fillStyle='#666'; ctx.font=fs+'px sans-serif'; ctx.textAlign='left';
  ctx.fillText(Math.round(max)+'m',2,fs+2); ctx.fillText(Math.round(min)+'m',2,H-pad+fs);
  ctx.fillStyle='#2563eb'; ctx.fillText('neu '+Math.round(eye)+'m',sx(0),H-6);
  ctx.fillStyle='#0b8f6a'; ctx.textAlign='right'; ctx.fillText(Math.round(top)+'m',sx(n-1),H-6); ctx.textAlign='left';
}

function openBigProfile(){
  if(!lastProfile) return;
  $('modalTitle').textContent='Geländeprofil'+(selected?(' — '+(selected.site.op||selected.site.id)):'');
  $('modal').classList.add('open');
  const cv=$('bigProfile'), rect=cv.getBoundingClientRect();
  cv.width=Math.max(600,Math.round(rect.width)); cv.height=Math.max(320,Math.round(rect.height));
  drawProfileInto(cv, lastProfile.data, lastProfile.los);
}
function closeBigProfile(){ $('modal').classList.remove('open'); }

function resetAll(){
  clearLines();
  if(newMarker) map.removeLayer(newMarker); newMarker=null; newPoint=null;
  if(radiusCircle) map.removeLayer(radiusCircle); radiusCircle=null;
  $('np').innerHTML='<span class="hint">'+SITES.length+' Standorte geladen. Auf die Karte klicken.</span>';
  $('sum').innerHTML=''; $('lineList').innerHTML='';
  $('details').innerHTML='Klicke eine Linie für Details + Geländeprofil.';
  $('profile').getContext('2d').clearRect(0,0,2000,2000);
  $('calc').disabled=true; $('calc').textContent='Losspinne berechnen';
  $('enlarge').disabled=true; lastProfile=null;
}
</script>
</body>
</html>`;

// =====================================================================
//  Gefälle-Prüfung für Aufstellflächen (z.B. MRT: max. 3 % auf 10 m).
//  Fläche per Klick + Maßen aufziehen -> /v1/slope -> Farbraster + Verdikt.
// =====================================================================
const GEFAELLE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gefälle-Prüfung — Aufstellflächen</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a2433; }
  header { padding: 10px 16px; background: #0b3b44; color: #fff; }
  header h1 { font-size: 16px; margin: 0; }
  header a { color: #9fe4d0; font-size: 13px; text-decoration: none; }
  #wrap { display: flex; height: calc(100vh - 44px); }
  #map { flex: 1; }
  #side { width: 340px; padding: 14px; overflow-y: auto; border-left: 1px solid #ddd; }
  fieldset { border: 1px solid #ddd; border-radius: 6px; margin: 0 0 12px; padding: 8px 10px; }
  legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
  label { font-size: 13px; display: block; margin: 6px 0 2px; }
  input, select { width: 100%; padding: 5px; font-size: 13px; }
  .rowflex { display: flex; gap: 8px; } .rowflex > div { flex: 1; }
  .hint { font-size: 12px; color: #666; margin: 4px 0; }
  button.primary { width:100%; padding:9px; margin-top:8px; cursor:pointer; background:#0b3b44; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:600; }
  button.primary:disabled { background:#9db4b8; cursor:default; }
  .verdict { font-size: 15px; font-weight: 700; padding: 8px; border-radius: 6px; text-align: center; margin-bottom: 8px; }
  .good { background: #e3f5ea; color: #17683c; } .bad { background: #fde8e8; color: #9b1c1c; }
  table.stats { width: 100%; font-size: 13px; border-collapse: collapse; }
  table.stats td { padding: 2px 0; } table.stats td:last-child { text-align: right; font-weight: 600; }
  .lg { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 3px 0; }
  .sw { width: 16px; height: 12px; border-radius: 2px; display: inline-block; }
</style>
</head>
<body>
<header><h1>Gefälle-Prüfung — Aufstellflächen &nbsp;·&nbsp; <a href="/losspinne">Losspinne</a> &nbsp;<a href="/docs">API-Doku</a></h1></header>
<div id="wrap">
  <div id="map"></div>
  <div id="side">
    <p class="hint"><b>Klick auf die Karte</b> setzt die Fläche (Maße unten). Dann <b>Prüfen</b>. Bewertet wird die stärkste Neigung über die Basislänge — grün = innerhalb der Grenze.</p>
    <fieldset>
      <legend>Fläche</legend>
      <div class="rowflex">
        <div><label>Breite (m)</label><input id="w" type="number" value="20" min="2" step="1"/></div>
        <div><label>Länge (m)</label><input id="l" type="number" value="40" min="2" step="1"/></div>
      </div>
      <div class="rowflex">
        <div><label>Basislänge (m)</label><input id="win" type="number" value="10" min="2" step="1"/></div>
        <div><label>Grenze (%)</label><input id="lim" type="number" value="3" min="0.1" step="0.1"/></div>
      </div>
      <label>Höhenmodell</label>
      <select id="model">
        <option value="dgm" selected>DGM — Gelände (korrekt für Aufstellflächen)</option>
        <option value="dom">DOM — Oberfläche (inkl. Bewuchs/Bebauung)</option>
      </select>
      <label>API-Key (optional)</label>
      <input id="apiKey" type="text" placeholder="leer = anonym (30/min)"/>
      <button id="calc" class="primary" disabled>Gefälle prüfen</button>
    </fieldset>
    <fieldset>
      <legend>Ergebnis</legend>
      <div id="out"><span class="hint">Noch keine Fläche geprüft.</span></div>
    </fieldset>
    <fieldset>
      <legend>Legende</legend>
      <div class="lg"><span class="sw" style="background:#2e9e5b"></span> innerhalb der Grenze</div>
      <div class="lg"><span class="sw" style="background:#e08e00"></span> bis 2× Grenze</div>
      <div class="lg"><span class="sw" style="background:#d23b3b"></span> darüber</div>
      <div class="lg"><span class="sw" style="background:#999"></span> keine Höhendaten</div>
    </fieldset>
    <p class="hint">Höhen: DGM/DOM Deutschland (1 m). Bewertung = Zentraldifferenz über die Basislänge.</p>
  </div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map').setView([51.7133, 14.4667], 17);
L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap, © OpenTopoMap', maxZoom: 19, maxNativeZoom: 17 }).addTo(map);
const $ = (id)=>document.getElementById(id);
function headers(){ const k=$('apiKey').value.trim(); return k?{'X-API-Key':k}:{}; }
function num(id,d){ const v=parseFloat($(id).value); return isFinite(v)?v:d; }

let center=null, rect=null, overlay=null;

map.on('click', e=>{ center=[e.latlng.lat,e.latlng.lng]; drawRect(); $('calc').disabled=false; });
['w','l'].forEach(id=> $(id).oninput = ()=>{ if(center) drawRect(); });
$('calc').onclick = check;

function halfDeg(){
  const w=num('w',20), l=num('l',40);
  return [ (l/2)/111320, (w/2)/(111320*Math.cos(center[0]*Math.PI/180)) ];
}
function bnds(){ const [hLat,hLon]=halfDeg();
  return [[center[0]-hLat,center[1]-hLon],[center[0]+hLat,center[1]+hLon]]; }
function drawRect(){
  if(rect) map.removeLayer(rect);
  rect=L.rectangle(bnds(),{color:'#0b3b44',weight:2,fill:false}).addTo(map);
}

async function check(){
  const b=bnds(), win=num('win',10), lim=num('lim',3), model=$('model').value;
  $('out').innerHTML='<span class="hint">… wird berechnet</span>';
  const q='bbox='+b[0][0]+','+b[0][1]+','+b[1][0]+','+b[1][1]
        +'&window='+win+'&limit='+lim+'&model='+model;
  try{
    const r=await fetch('/v1/slope?'+q,{headers:headers()});
    const d=await r.json();
    if(!r.ok){ $('out').innerHTML='<b>Fehler:</b> '+(d.error||('HTTP '+r.status))
        +(d.code==='OUT_OF_COVERAGE'||d.error&&d.error.indexOf('coverage')>=0?'<br><span class="hint">Für dieses Gebiet sind noch keine '+model.toUpperCase()+'-Kacheln verarbeitet.</span>':''); return; }
    renderOverlay(d); renderStats(d);
  }catch(e){ $('out').textContent='Netzwerkfehler'; }
}

function renderOverlay(d){
  const cols=d.grid.cols, rows=d.grid.rows, lim=d.limit_percent;
  const cv=document.createElement('canvas'); cv.width=cols; cv.height=rows;
  const ctx=cv.getContext('2d'), img=ctx.createImageData(cols,rows);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const v=d.slope_percent[r*cols+c];
      const px=((rows-1-r)*cols+c)*4;   // Grid Zeile0=Süden, Bild Zeile0=Norden
      let col;
      if(v===null) col=[153,153,153,120];
      else if(v<=lim) col=[46,158,91,150];
      else if(v<=lim*2) col=[224,142,0,150];
      else col=[210,59,59,165];
      img.data[px]=col[0]; img.data[px+1]=col[1]; img.data[px+2]=col[2]; img.data[px+3]=col[3];
    }
  }
  ctx.putImageData(img,0,0);
  if(overlay) map.removeLayer(overlay);
  overlay=L.imageOverlay(cv.toDataURL(),[[d.bounds.south,d.bounds.west],[d.bounds.north,d.bounds.east]],{opacity:.85}).addTo(map);
}

function renderStats(d){
  const s=d.stats, ok=s.suitable;
  $('out').innerHTML =
    '<div class="verdict '+(ok?'good':'bad')+'">'+(ok?'✓ Fläche geeignet':'✗ nicht durchgehend geeignet')+'</div>'
    +'<table class="stats">'
    +'<tr><td>innerhalb '+d.limit_percent+' % / '+d.window_m+' m</td><td>'+s.ok_percent+' %</td></tr>'
    +'<tr><td>max. Gefälle</td><td>'+s.max_percent+' %</td></tr>'
    +'<tr><td>mittleres Gefälle</td><td>'+(s.mean_percent===null?'—':s.mean_percent+' %')+'</td></tr>'
    +'<tr><td>Zellen über Grenze</td><td>'+s.over_limit_cells+' / '+s.evaluated+'</td></tr>'
    +(s.nodata?'<tr><td>ohne Höhendaten</td><td>'+s.nodata+'</td></tr>':'')
    +'<tr><td>Raster</td><td>'+d.grid.cols+'×'+d.grid.rows+' @ '+d.step_m+' m</td></tr>'
    +'<tr><td>Modell</td><td>'+d.model.toUpperCase()+'</td></tr>'
    +'</table>';
}
</script>
</body>
</html>`;

// ---- Helpers ----

/** Parst "lat,lon" → {lat, lon}; wirft 400 bei ungültiger Eingabe. */
function parseLatLon(value, name) {
  if (!value) throw apiError(`Query param "${name}" required as "lat,lon"`, 400, 'BAD_REQUEST');
  const parts = value.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) {
    throw apiError(`Invalid "${name}": expected "lat,lon" (decimal degrees, WGS84)`, 400, 'BAD_REQUEST');
  }
  checkLatLon(parts[0], parts[1], name);
  return { lat: parts[0], lon: parts[1] };
}

/** Parst "lat,lon[,h]" → {lat, lon, h}; h optional mit Default. */
function parseCoordWithHeight(value, name, defaultHeight) {
  if (!value) throw apiError(`Query param "${name}" required as "lat,lon[,height]"`, 400, 'BAD_REQUEST');
  const parts = value.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) {
    throw apiError(`Invalid "${name}": expected "lat,lon[,height]" (decimal degrees, WGS84)`, 400, 'BAD_REQUEST');
  }
  checkLatLon(parts[0], parts[1], name);
  const h = parts.length >= 3 && isFinite(parts[2]) ? parts[2] : defaultHeight;
  return { lat: parts[0], lon: parts[1], h };
}

/** Prüft den gültigen geographischen Wertebereich; wirft 400 bei Verstoß. */
function checkLatLon(lat, lon, name) {
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw apiError(`Invalid "${name}": lat must be -90..90, lon -180..180`, 400, 'BAD_REQUEST');
  }
}

/** Parst & begrenzt den samples-Parameter. */
function parseSamples(value) {
  if (value === null || value === '') return DEFAULT_SAMPLES;
  const n = parseInt(value, 10);
  if (!isFinite(n) || n < 2) throw apiError('Invalid "samples": integer >= 2 required', 400, 'BAD_REQUEST');
  return Math.min(n, MAX_SAMPLES);
}

/** Parst eine Zahl mit Default und [min,max]-Clamping. */
function clampNum(value, def, min, max, name) {
  if (value === null || value === '') return def;
  const n = parseFloat(value);
  if (!isFinite(n)) throw apiError(`Invalid "${name}": number required`, 400, 'BAD_REQUEST');
  return Math.min(max, Math.max(min, n));
}

/** Geodätischer Zielpunkt (sphärisch): Start + Peilung(°) + Distanz(m) → {lat,lon}. */
function destPoint(lat, lon, bearingDeg, distM) {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180, λ1 = (lon * Math.PI) / 180;
  const dr = distM / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(dr) + Math.cos(φ1) * Math.sin(dr) * Math.cos(br));
  const λ2 = λ1 + Math.atan2(
    Math.sin(br) * Math.sin(dr) * Math.cos(φ1),
    Math.cos(dr) - Math.sin(φ1) * Math.sin(φ2)
  );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

/** Geodätische Distanz (Haversine) in Metern. */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const round2 = (v) => Math.round(v * 100) / 100;
const round6 = (v) => Math.round(v * 1e6) / 1e6;

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
