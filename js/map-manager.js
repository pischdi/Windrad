/**
 * ========================================
 * MAP MANAGER
 * Handles Leaflet map, markers, and interactions
 * ======================================== */

class MapManager {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.turbineMarkers = [];
        this.sightLine = null;
        this.userLocation = null;
        this.allTurbines = [];
        this.currentTurbine = null;
        this.onTurbineSelected = null; // Callback
    }

    /**
     * Initialize Leaflet map
     */
    initMap() {
        this.map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        }).setView(
            [CONFIG.MAP.defaultLocation.lat, CONFIG.MAP.defaultLocation.lng],
            CONFIG.MAP.defaultZoom
        );

        L.tileLayer(CONFIG.MAP.tileLayer, {
            attribution: CONFIG.MAP.attribution,
            maxZoom: CONFIG.MAP.maxZoom
        }).addTo(this.map);

        log('Map initialized');
    }

    /**
     * Set user location and add marker
     */
    setUserLocation(lat, lng) {
        this.userLocation = { lat, lng };
        
        if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
        }
        
        this.userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'user-marker',
                html: '<div style="background: #2196F3; color: white; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20]
            })
        }).addTo(this.map);
        
        this.map.setView([lat, lng], 14);
        log('User location set:', lat, lng);
    }

    /**
     * Load and display turbines on map
     */
    async loadTurbines() {
        try {
            const response = await fetch(CONFIG.CSV_URL);
            const text = await response.text();
            const lines = text.trim().split('\n');
            
            this.allTurbines = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length >= 6) {
                    this.allTurbines.push({
                        id: parts[0],
                        name: parts[1],
                        hubHeight: parseFloat(parts[2]),
                        rotorDiameter: parseFloat(parts[3]),
                        lat: parseFloat(parts[4]),
                        lon: parseFloat(parts[5])
                    });
                }
            }
            
            this.displayTurbinesOnMap();
            log('Turbines loaded:', this.allTurbines.length);
            
        } catch (error) {
            console.error('Error loading turbines:', error);
            throw error;
        }
    }

    /**
     * Display turbine markers on map
     */
    displayTurbinesOnMap() {
        // Remove existing markers
        this.turbineMarkers.forEach(marker => this.map.removeLayer(marker));
        this.turbineMarkers = [];
        
        // Add new markers
        this.allTurbines.forEach(turbine => {
            const marker = L.marker([turbine.lat, turbine.lon], {
                icon: L.divIcon({
                    className: 'turbine-marker',
                    html: '<div style="background: #1a5f3b; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🌬️</div>',
                    iconSize: [30, 30]
                })
            }).addTo(this.map);
            
            marker.on('click', () => this.selectTurbine(turbine));
            this.turbineMarkers.push(marker);
        });
    }

    /**
     * Select a turbine and draw sight line
     */
    selectTurbine(turbine) {
        if (!this.userLocation) {
            log('No user location set');
            return;
        }

        this.currentTurbine = turbine;
        log('Turbine selected:', turbine.name);
        
        // Remove old sight line
        if (this.sightLine) {
            this.map.removeLayer(this.sightLine);
        }
        
        // Draw new sight line
        this.sightLine = L.polyline([
            [this.userLocation.lat, this.userLocation.lng],
            [turbine.lat, turbine.lon]
        ], {
            color: '#1a5f3b',
            weight: 2,
            dashArray: '10, 10'
        }).addTo(this.map);
        
        // Fit map to show both user and turbine
        this.map.fitBounds([
            [this.userLocation.lat, this.userLocation.lng],
            [turbine.lat, turbine.lon]
        ], { padding: [50, 50] });
        
        // Trigger callback
        if (this.onTurbineSelected) {
            this.onTurbineSelected(turbine);
        }
    }

    /**
     * Get sorted turbines by distance from user
     */
    getSortedTurbines() {
        if (!this.userLocation) return [];
        
        return this.allTurbines.map(t => ({
            turbine: t,
            distance: calcDistance(
                this.userLocation.lat,
                this.userLocation.lng,
                t.lat,
                t.lon
            ),
            bearing: calcBearing(
                this.userLocation.lat,
                this.userLocation.lng,
                t.lat,
                t.lon
            )
        })).sort((a, b) => a.distance - b.distance);
    }

    /**
     * Get current turbine
     */
    getCurrentTurbine() {
        return this.currentTurbine;
    }

    /**
     * Get user location
     */
    getUserLocation() {
        return this.userLocation;
    }

    /**
     * Get all turbines
     */
    getAllTurbines() {
        return this.allTurbines;
    }
}
