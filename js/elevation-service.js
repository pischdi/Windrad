/**
 * ========================================
 * ELEVATION SERVICE
 * Brandenburg Digitales Oberflächenmodell (DOM)
 *
 * Unterstützt:
 * - Lokale Binary Tiles (LAZ → Binary)
 * - OpenElevation Fallback
 * ======================================== */

class ElevationService {
    constructor() {
        this.cache = new Map();
        this.cacheEnabled = CONFIG.ELEVATION.cacheEnabled;
        this.tileCache = new Map(); // Cache für geladene Tiles

        // Kacheln kommen über die Elevation-API, nicht mehr direkt aus dem
        // R2-Bucket. Damit greifen Schlüssel, Limit und Herkunftsprüfung auch
        // für die AR-App, und der Bucket kann geschlossen bleiben.
        this.tileApiUrl = `${CONFIG.ELEVATION_API}/v1/tile`;
        this.apiKey = CONFIG.ELEVATION.apiKey || null;
        this.utmZone = CONFIG.ELEVATION.utmZone || 33;
    }

    /**
     * Get elevation profile between two points
     */
    async getProfile(lat1, lon1, lat2, lon2, samples = CONFIG.ELEVATION.samples) {
        const cacheKey = `${lat1}_${lon1}_${lat2}_${lon2}_${samples}`;
        
        // Check cache
        if (this.cacheEnabled && this._checkCache(cacheKey)) {
            log('Using cached elevation profile');
            return this._getFromCache(cacheKey);
        }
        
        try {
            // Try Brandenburg DOM WMS first
            log('Fetching from Brandenburg DOM WMS...');
            const profile = await this._fetchFromBrandenburgWMS(lat1, lon1, lat2, lon2, samples);
            
            // Cache result
            if (this.cacheEnabled) {
                this._saveToCache(cacheKey, profile);
            }
            
            return profile;
            
        } catch (err) {
            error('Brandenburg WMS failed, trying fallback:', err);

            // Fallback to OpenElevation
            return await this._fetchFromOpenElevation(lat1, lon1, lat2, lon2, samples);
        }
    }

    /**
     * Fetch elevation from Brandenburg DOM WMS
     */
    async _fetchFromBrandenburgWMS(lat1, lon1, lat2, lon2, samples) {
        // Convert WGS84 to ETRS89/UTM33N (EPSG:25833)
        const points = this._interpolatePoints(lat1, lon1, lat2, lon2, samples);
        const profile = [];

        for (const point of points) {
            const utm = this._convertToUTM(point.lat, point.lng);
            const elevation = await this._getElevationFromWMS(utm.x, utm.y);

            profile.push({
                lat: point.lat,
                lng: point.lng,
                elevation: elevation
            });
        }

        // Mark as DSM (Digital Surface Model with trees/buildings)
        profile.isDSM = true;

        return profile;
    }

    /**
     * Get elevation from local Binary Tiles
     */
    async _getElevationFromWMS(x, y) {
        try {
            // Berechne Tile-ID (1000m × 1000m Kacheln)
            const tileX = Math.floor(x / 1000);
            const tileY = Math.floor(y / 1000);
            const tileKey = `${tileX}_${tileY}`;

            // Lade Tile (mit Cache)
            const tile = await this._loadBinaryTile(tileX, tileY);

            // Lokale Koordinate innerhalb der Kachel
            const localX = Math.floor(x - (tileX * 1000));
            const localY = Math.floor(y - (tileY * 1000));

            // Grid-Index (1000×1000 Grid)
            const index = localY * 1000 + localX;

            // Höhe aus Tile extrahieren. Der Teiler kommt aus der Kachel
            // (cm = 100, dm = 10), nicht aus einer festen Annahme.
            const heightM = tile.heights[index] / tile.divisor;

            log(`Elevation @ (${x.toFixed(0)}, ${y.toFixed(0)}): ${heightM.toFixed(2)}m`);

            return heightM;

        } catch (err) {
            error('Failed to load binary tile:', err);
            throw new Error('Binary tile not available, use fallback');
        }
    }

    /**
     * Load Binary Tile from server
     */
    async _loadBinaryTile(tileX, tileY) {
        const tileKey = `${tileX}_${tileY}`;

        // Check cache
        if (this.tileCache.has(tileKey)) {
            log(`Using cached tile: ${tileKey}`);
            return this.tileCache.get(tileKey);
        }

        log(`Loading tile: ${tileKey}`);

        // Kachel über die API holen (Schlüssel + Limit + Herkunftsprüfung).
        const url = `${this.tileApiUrl}?zone=${this.utmZone}&x=${tileX}&y=${tileY}&model=dom`;
        const response = await fetch(url, {
            headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Tile not processed yet: ${tileKey}`);
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error(`Tile access denied (${response.status}) — check CONFIG.ELEVATION.apiKey`);
            }
            throw new Error(`Tile request failed (${response.status}): ${tileKey}`);
        }

        // Einheit der Werte: Uint16 in Zentimetern endet bei 655,35 m, deshalb
        // werden neue Kacheln in Dezimetern geschrieben. Welche Einheit gilt,
        // sagt der Server je Kachel über X-Tile-Unit. Fehlt die Kopfzeile
        // (Altbestand oder alter Worker), ist es cm.
        const unit = (response.headers.get('X-Tile-Unit') || 'cm').toLowerCase();
        const divisor = unit === 'dm' ? 10.0 : 100.0;

        // Read as ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();

        // Decode as Uint16Array (Rohwerte in der oben ermittelten Einheit)
        const heights = new Uint16Array(arrayBuffer);

        if (heights.length !== 1000 * 1000) {
            throw new Error(`Invalid tile size: ${heights.length} (expected 1000000)`);
        }

        const tile = { heights, divisor, unit };

        // Cache tile
        this.tileCache.set(tileKey, tile);

        log(`Tile loaded: ${tileKey} (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB, Einheit ${unit})`);

        return tile;
    }

    /**
     * Fallback to OpenElevation API (free, unlimited)
     */
    async _fetchFromOpenElevation(lat1, lon1, lat2, lon2, samples) {
        log('Using OpenElevation fallback (free, no limits)');
        error('⚠️ Brandenburg DOM nicht verfügbar - OpenElevation DTM verwendet (ohne Bäume/Gebäude)');

        const points = this._interpolatePoints(lat1, lon1, lat2, lon2, samples);
        const locations = points.map(p => ({ latitude: p.lat, longitude: p.lng }));

        const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations })
        });

        if (!response.ok) {
            throw new Error(`OpenElevation API error: ${response.status}`);
        }

        const data = await response.json();

        const profile = data.results.map((r, i) => ({
            lat: points[i].lat,
            lng: points[i].lng,
            elevation: r.elevation
        }));

        // Mark as DTM (Digital Terrain Model - no trees/buildings)
        profile.isDSM = false;

        return profile;
    }

    /**
     * Interpolate points between two coordinates
     */
    _interpolatePoints(lat1, lon1, lat2, lon2, samples) {
        const points = [];
        
        for (let i = 0; i < samples; i++) {
            const t = i / (samples - 1);
            points.push({
                lat: lat1 + (lat2 - lat1) * t,
                lng: lon1 + (lon2 - lon1) * t
            });
        }
        
        return points;
    }

    /**
     * Convert WGS84 to UTM33N (EPSG:25833)
     *
     * Vollständige Transverse-Mercator-Vorwärtsformel (Snyder) inkl.
     * Meridianbogen M. Die frühere Näherung (y = k0·N·latRad) ließ M weg
     * und lieferte einen um ~37 km falschen Northing → die App lud die
     * falsche Kachel und fiel auf OpenElevation zurück. Verifiziert gegen
     * alle vier bekannten Windrad-Kacheln (siehe elevation-api/).
     */
    _convertToUTM(lat, lng) {
        const a = 6378137.0;                 // WGS84 große Halbachse
        const f = 1 / 298.257223563;         // Abplattung
        const e2 = f * (2 - f);              // erste Exzentrizität²
        const k0 = 0.9996;                   // Maßstabsfaktor
        const lon0 = 15 * Math.PI / 180;     // Mittelmeridian Zone 33N

        const phi = lat * Math.PI / 180;
        const lam = lng * Math.PI / 180;
        const ep2 = e2 / (1 - e2);

        const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
        const T = Math.tan(phi) ** 2;
        const C = ep2 * Math.cos(phi) ** 2;
        const A = (lam - lon0) * Math.cos(phi);

        const M = a * (
            (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi
            - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
            + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
            - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
        );

        const x = k0 * N * (
            A + (1 - T + C) * A ** 3 / 6
            + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120
        ) + 500000;

        const y = k0 * (
            M + N * Math.tan(phi) * (
                A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
                + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720
            )
        );

        return { x: x, y: y };
    }

    /**
     * Cache management
     */
    _getCacheKey(key) {
        return `elevation_${key}`;
    }

    _checkCache(key) {
        const cacheKey = this._getCacheKey(key);
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) return false;
        
        const data = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache expired
        if (now - data.timestamp > CONFIG.ELEVATION.cacheDuration) {
            localStorage.removeItem(cacheKey);
            return false;
        }
        
        return true;
    }

    _getFromCache(key) {
        const cacheKey = this._getCacheKey(key);
        const cached = localStorage.getItem(cacheKey);
        const data = JSON.parse(cached);
        return data.profile;
    }

    _saveToCache(key, profile) {
        const cacheKey = this._getCacheKey(key);
        const data = {
            profile: profile,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            log('Saved to cache:', cacheKey);
        } catch (e) {
            error('Failed to save to cache:', e);
        }
    }

    /**
     * Clear all cached profiles
     */
    clearCache() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('elevation_')) {
                localStorage.removeItem(key);
            }
        });
        log('Cache cleared');
    }
}

// Utility functions for distance/bearing calculations
function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
             Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calcBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
             Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function toRad(deg) {
    return deg * Math.PI / 180;
}

function toDeg(rad) {
    return rad * 180 / Math.PI;
}

function formatDistance(km) {
    if (km < 1) {
        return Math.round(km * 1000) + ' m';
    }
    return km.toFixed(2) + ' km';
}

function formatDirection(bearing) {
    const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index] + ' (' + Math.round(bearing) + '°)';
}
