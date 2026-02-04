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

        // Tile Server URL (lokal für Entwicklung)
        this.tileServerUrl = 'http://localhost:8000/tiles';
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

            // Höhe aus Tile extrahieren
            const heightCm = tile[index];
            const heightM = heightCm / 100.0;

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

        // Fetch tile (uncompressed for simplicity)
        const url = `${this.tileServerUrl}/tile_${tileKey}.bin`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Tile not found: ${tileKey}`);
        }

        // Read as ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();

        // Decode as Uint16Array (heights in cm)
        const heights = new Uint16Array(arrayBuffer);

        if (heights.length !== 1000 * 1000) {
            throw new Error(`Invalid tile size: ${heights.length} (expected 1000000)`);
        }

        // Cache tile
        this.tileCache.set(tileKey, heights);

        log(`Tile loaded: ${tileKey} (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`);

        return heights;
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
     * Simplified conversion for Brandenburg region
     */
    _convertToUTM(lat, lng) {
        // This is a simplified conversion
        // For production, use proj4js or similar library
        
        const a = 6378137.0; // WGS84 semi-major axis
        const k0 = 0.9996;   // scale factor
        const e = 0.081819190842622; // eccentricity
        
        const latRad = lat * Math.PI / 180;
        const lngRad = lng * Math.PI / 180;
        const lngOrigin = 15 * Math.PI / 180; // Zone 33N center
        
        const N = a / Math.sqrt(1 - e * e * Math.sin(latRad) * Math.sin(latRad));
        const T = Math.tan(latRad) * Math.tan(latRad);
        const C = e * e * Math.cos(latRad) * Math.cos(latRad) / (1 - e * e);
        const A = (lngRad - lngOrigin) * Math.cos(latRad);
        
        const x = k0 * N * (A + (1 - T + C) * A * A * A / 6);
        const y = k0 * N * latRad;
        
        return { x: 500000 + x, y: y };
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
