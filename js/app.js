/**
 * ========================================
 * WINDRAD AR - MAIN APPLICATION
 * Brandenburg Oberflächenmodell Integration
 * ======================================== */

class WindradARApp {
    constructor() {
        // Initialize services
        this.elevationService = new ElevationService();
        this.visibilityCalculator = new VisibilityCalculator(this.elevationService);
        this.mapManager = new MapManager();
        this.windradRenderer = new WindradRenderer();
        this.cameraController = new CameraController();
        
        // State
        this.currentVisibilityData = null;
        
        // Bind methods
        this._onTurbineSelected = this._onTurbineSelected.bind(this);
        this._onPhotoButtonClick = this._onPhotoButtonClick.bind(this);
        this._onCaptureButtonClick = this._onCaptureButtonClick.bind(this);
        this._onCloseButtonClick = this._onCloseButtonClick.bind(this);
    }

    /**
     * Initialize application
     */
    async init() {
        log('Initializing Windrad AR Application...');
        
        try {
            // Initialize map
            this.mapManager.initMap();
            this.mapManager.onTurbineSelected = this._onTurbineSelected;
            
            // Get user location
            await this._getUserLocation();
            
            // Load turbines
            await this.mapManager.loadTurbines();
            
            // Render turbine list
            this._renderTurbineList();
            
            // Setup event listeners
            this._setupEventListeners();
            
            log('Application initialized successfully');
            
        } catch (err) {
            error('Initialization failed:', err);
            this._showError('Initialisierung fehlgeschlagen: ' + err.message);
        }
    }

    /**
     * Get user GPS location
     */
    async _getUserLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                alert('⚠️ GPS nicht verfügbar. Verwende Standard-Standort Neuhausen/Spree.');
                this.mapManager.setUserLocation(
                    CONFIG.MAP.defaultLocation.lat,
                    CONFIG.MAP.defaultLocation.lng
                );
                resolve();
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    this.mapManager.setUserLocation(lat, lng);
                    log('GPS location:', lat, lng, '(Genauigkeit: ' + Math.round(position.coords.accuracy) + 'm)');
                    resolve();
                },
                error => {
                    console.error('GPS Error:', error);

                    // Provide detailed error message
                    let message = '⚠️ GPS-Fehler: ';
                    switch (error.code) {
                        case 1:
                            message += 'Standort-Berechtigung verweigert.';
                            break;
                        case 2:
                            message += 'Standort nicht verfügbar.';
                            break;
                        case 3:
                            message += 'Timeout beim GPS-Abruf.';
                            break;
                        default:
                            message += error.message;
                    }
                    message += '\n\nVerwende Standard-Standort (Neuhausen/Spree).';

                    alert(message);

                    // Use default location as fallback
                    this.mapManager.setUserLocation(
                        CONFIG.MAP.defaultLocation.lat,
                        CONFIG.MAP.defaultLocation.lng
                    );
                    log('Using default location');
                    resolve();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        });
    }

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        document.getElementById('photoBtn').addEventListener('click', this._onPhotoButtonClick);
        document.getElementById('captureBtn').addEventListener('click', this._onCaptureButtonClick);
        document.getElementById('closeBtn').addEventListener('click', this._onCloseButtonClick);
    }

    /**
     * Render turbine list
     */
    _renderTurbineList() {
        const list = document.getElementById('turbineList');
        const sorted = this.mapManager.getSortedTurbines();
        
        if (sorted.length === 0) {
            list.innerHTML = '<p style="color: #666; text-align: center;">Keine Windräder gefunden</p>';
            return;
        }
        
        list.innerHTML = sorted.map(item => {
            const isActive = this.mapManager.getCurrentTurbine()?.id === item.turbine.id;
            
            return `
                <div class="turbine-item ${isActive ? 'active' : ''}" 
                     data-turbine-id="${item.turbine.id}">
                    <h4>🌬️ ${item.turbine.name}</h4>
                    <div class="turbine-meta">
                        <span>📏 ${formatDistance(item.distance)}</span>
                        <span>🧭 ${formatDirection(item.bearing)}</span>
                        <span>📊 ${item.turbine.hubHeight}m / ${item.turbine.rotorDiameter}m</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click listeners
        list.querySelectorAll('.turbine-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.turbineId;
                const turbine = this.mapManager.getAllTurbines().find(t => t.id == id);
                if (turbine) {
                    this.mapManager.selectTurbine(turbine);
                }
            });
        });
    }

    /**
     * Handle turbine selection
     */
    async _onTurbineSelected(turbine) {
        log('Turbine selected:', turbine.name);
        
        // Update UI
        this._updateTurbineInfo(turbine);
        this._renderTurbineList();
        
        // Calculate visibility
        await this._calculateVisibility(turbine);
        
        // Enable photo button
        document.getElementById('photoBtn').disabled = false;
    }

    /**
     * Update turbine info display
     */
    _updateTurbineInfo(turbine) {
        const userLocation = this.mapManager.getUserLocation();
        const distance = calcDistance(userLocation.lat, userLocation.lng, turbine.lat, turbine.lon);
        const bearing = calcBearing(userLocation.lat, userLocation.lng, turbine.lat, turbine.lon);
        
        document.getElementById('distanceDisplay').textContent = formatDistance(distance);
        document.getElementById('directionDisplay').textContent = formatDirection(bearing);
        document.getElementById('hubHeightDisplay').textContent = turbine.hubHeight + ' m';
        document.getElementById('rotorDiameterDisplay').textContent = turbine.rotorDiameter + ' m';
    }

    /**
     * Calculate visibility with elevation data
     */
    async _calculateVisibility(turbine) {
        const loading = document.getElementById('loading');
        loading.classList.add('active');
        
        try {
            const userLocation = this.mapManager.getUserLocation();
            const turbineHeight = turbine.hubHeight + (turbine.rotorDiameter / 2);
            
            log('Calculating visibility...');
            this.currentVisibilityData = await this.visibilityCalculator.calculateVisibility(
                userLocation.lat, userLocation.lng,
                turbine.lat, turbine.lon,
                turbineHeight
            );
            
            if (this.currentVisibilityData) {
                this._displayVisibilityInfo(this.currentVisibilityData);
            } else {
                this._hideVisibilityInfo();
            }
            
        } catch (err) {
            error('Visibility calculation failed:', err);
            this._hideVisibilityInfo();
        } finally {
            loading.classList.remove('active');
        }
    }

    /**
     * Display visibility information
     */
    _displayVisibilityInfo(data) {
        const visibilityInfo = document.getElementById('visibilityInfo');
        const statusText = this.visibilityCalculator.getStatusText(data);
        
        visibilityInfo.className = 'visibility-info ' + data.status;
        visibilityInfo.style.display = 'block';
        
        document.getElementById('visibilityStatus').innerHTML = 
            `${statusText.icon} <strong>${statusText.title}</strong>`;
        document.getElementById('visibilityPercentage').textContent = statusText.description;
        document.getElementById('visibilityObstacle').textContent = statusText.obstacle;
        
        // Draw elevation profile
        const canvas = document.getElementById('elevationCanvas');
        document.getElementById('elevationProfile').style.display = 'block';
        this.visibilityCalculator.drawProfile(canvas, data);
        
        log('Visibility displayed:', data.status, Math.round(data.visiblePercentage) + '%');
    }

    /**
     * Hide visibility information
     */
    _hideVisibilityInfo() {
        document.getElementById('visibilityInfo').style.display = 'none';
        document.getElementById('elevationProfile').style.display = 'none';
    }

    /**
     * Handle photo button click
     */
    async _onPhotoButtonClick() {
        try {
            await this.cameraController.requestPermissions();
            await this.cameraController.startCamera();
            
            const turbine = this.mapManager.getCurrentTurbine();
            const userLocation = this.mapManager.getUserLocation();
            const bearing = calcBearing(userLocation.lat, userLocation.lng, turbine.lat, turbine.lon);
            
            this.cameraController.setTargetBearing(bearing);
            
        } catch (err) {
            error('Camera start failed:', err);
            alert('Fehler beim Starten der Kamera: ' + err.message);
        }
    }

    /**
     * Handle capture button click
     */
    _onCaptureButtonClick() {
        const turbine = this.mapManager.getCurrentTurbine();
        const userLocation = this.mapManager.getUserLocation();
        
        this.cameraController.takePhoto(
            turbine,
            userLocation,
            this.currentVisibilityData,
            this.windradRenderer
        );
    }

    /**
     * Handle close button click
     */
    _onCloseButtonClick() {
        this.cameraController.stopCamera();
    }

    /**
     * Show error message
     */
    _showError(message) {
        alert('Fehler: ' + message);
    }
}

// ========================================
// INITIALIZE APP ON LOAD
// ========================================

window.addEventListener('load', async () => {
    log('Window loaded, starting application...');
    
    const app = new WindradARApp();
    await app.init();
    
    // Make app globally accessible for debugging
    if (CONFIG.DEBUG) {
        window.windradApp = app;
    }
});
