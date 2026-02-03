/**
 * ========================================
 * WINDRAD AR - CONFIGURATION
 * ========================================
 */

const CONFIG = {
    // Brandenburg Oberflächenmodell (DOM) WMS
    BRANDENBURG_DOM: {
        wmsUrl: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms',
        layer: 'by_dop20c',
        version: '1.3.0',
        format: 'image/png',
        srs: 'EPSG:25833',
        // Fallback to OpenElevation if WMS fails
        fallbackUrl: 'https://api.open-elevation.com/api/v1/lookup'
    },
    
    // CSV Windräder Daten
    CSV_URL: 'https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv',
    
    // Elevation Profile Settings
    ELEVATION: {
        samples: 20,           // Anzahl Messpunkte zwischen User und Windrad
        cacheEnabled: true,    // localStorage Cache aktivieren
        cacheDuration: 86400000 // 24 Stunden in Millisekunden
    },
    
    // Map Settings
    MAP: {
        defaultLocation: { 
            lat: 51.6724, 
            lng: 14.4354 
        }, // Neuhausen/Spree
        defaultZoom: 13,
        maxZoom: 18,
        tileLayer: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap, © OpenTopoMap'
    },
    
    // Visibility Thresholds
    VISIBILITY: {
        blockedThreshold: 10,     // < 10% = blocked
        partialThreshold: 70,     // 10-70% = partial
        visibleThreshold: 70      // > 70% = visible
    },
    
    // Camera Settings
    CAMERA: {
        targetThreshold: 10,      // Grad Abweichung für "perfekt"
        videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    },
    
    // User Eye Level
    USER_EYE_HEIGHT: 1.7,  // Meter über Boden
    
    // Debug Mode
    DEBUG: false
};

// Logging Helper
const log = (...args) => {
    if (CONFIG.DEBUG) {
        console.log('[WINDRAD-AR]', ...args);
    }
};

const error = (...args) => {
    console.error('[WINDRAD-AR ERROR]', ...args);
};

// Export for ES6 modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, log, error };
}
