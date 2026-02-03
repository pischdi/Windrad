/**
 * ========================================
 * CAMERA CONTROLLER
 * Handles camera, compass, and photo capture
 * ======================================== */

class CameraController {
    constructor() {
        this.cameraStream = null;
        this.deviceOrientation = 0;
        this.targetBearing = 0;
        this.isActive = false;
        this.onPhotoTaken = null; // Callback
    }

    /**
     * Request camera and compass permissions (iOS)
     */
    async requestPermissions() {
        try {
            // Request compass permission (iOS requirement)
            if (typeof DeviceOrientationEvent !== 'undefined' &&
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Kompass-Berechtigung wurde verweigert.');
                }
                log('Kompass-Berechtigung erteilt');
            }

            // Check if camera API is available (but don't request yet)
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Kamera-API nicht verfügbar. Verwenden Sie HTTPS.');
            }

            log('Kamera-API verfügbar');
            return true;

        } catch (error) {
            console.error('Permission error:', error);
            throw error;
        }
    }

    /**
     * Start camera stream
     */
    async startCamera() {
        try {
            log('Starting camera with constraints:', CONFIG.CAMERA.videoConstraints);

            this.cameraStream = await navigator.mediaDevices.getUserMedia(
                CONFIG.CAMERA.videoConstraints
            );

            log('Camera stream obtained, setting up video element...');

            const video = document.getElementById('cameraPreview');
            video.srcObject = this.cameraStream;

            document.getElementById('cameraView').classList.add('active');
            this.isActive = true;

            // Setup orientation listeners
            this._setupOrientationListeners();

            log('Camera started successfully');

        } catch (error) {
            console.error('Camera error:', error);

            // Provide detailed error messages
            let message = 'Kamera konnte nicht gestartet werden: ';
            if (error.name === 'NotAllowedError') {
                message += 'Berechtigung verweigert. Bitte in den Browser-Einstellungen erlauben.';
            } else if (error.name === 'NotFoundError') {
                message += 'Keine Kamera gefunden.';
            } else if (error.name === 'NotReadableError') {
                message += 'Kamera wird bereits von einer anderen Anwendung verwendet.';
            } else if (error.name === 'OverconstrainedError') {
                message += 'Kamera erfüllt die Anforderungen nicht (z.B. keine Rückkamera).';
            } else if (error.name === 'SecurityError') {
                message += 'HTTPS erforderlich.';
            } else {
                message += error.message;
            }

            throw new Error(message);
        }
    }

    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        window.removeEventListener('deviceorientation', this._handleOrientation);
        window.removeEventListener('deviceorientationabsolute', this._handleOrientation);
        
        document.getElementById('cameraView').classList.remove('active');
        this.isActive = false;
        
        log('Camera stopped');
    }

    /**
     * Set target bearing for direction indicator
     */
    setTargetBearing(bearing) {
        this.targetBearing = bearing;
        this._updateDirectionIndicator();
    }

    /**
     * Setup device orientation listeners
     */
    _setupOrientationListeners() {
        this._handleOrientation = this._handleOrientation.bind(this);
        
        // iOS
        window.addEventListener('deviceorientation', this._handleOrientation);
        // Android
        window.addEventListener('deviceorientationabsolute', this._handleOrientation);
    }

    /**
     * Handle device orientation changes
     */
    _handleOrientation(event) {
        let newOrientation = null;

        // iOS uses webkitCompassHeading
        if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
            newOrientation = event.webkitCompassHeading;
        }
        // Android uses alpha (inverted)
        else if (event.alpha !== null && event.alpha !== undefined) {
            newOrientation = 360 - event.alpha;
        }

        // Only update if we have a valid value
        if (newOrientation !== null) {
            this.deviceOrientation = newOrientation;
            this._updateDirectionIndicator();
        } else {
            // Compass not available - show error message
            const compassDisplay = document.getElementById('compassDisplay');
            const directionText = document.getElementById('directionText');

            if (compassDisplay) {
                compassDisplay.textContent = 'Kompass nicht verfügbar';
            }
            if (directionText) {
                directionText.textContent = '⚠️ Gerät hat keinen Magnetometer';
            }

            error('Kompass-Daten nicht verfügbar. Gerät hat möglicherweise keinen Magnetometer.');
        }
    }

    /**
     * Update direction indicator UI
     */
    _updateDirectionIndicator() {
        const diff = (this.targetBearing - this.deviceOrientation + 360) % 360;
        
        const indicator = document.getElementById('directionIndicator');
        const arrow = document.getElementById('directionArrow');
        const text = document.getElementById('directionText');
        const compass = document.getElementById('compassDisplay');
        const debug = document.getElementById('debugInfo');
        
        compass.textContent = formatDirection(this.deviceOrientation);
        debug.innerHTML = `Kompass: ${Math.round(this.deviceOrientation)}°<br>` +
                         `Ziel: ${Math.round(this.targetBearing)}°<br>` +
                         `Diff: ${Math.round(diff)}°`;
        
        if (Math.abs(diff) < CONFIG.CAMERA.targetThreshold || 
            Math.abs(diff) > (360 - CONFIG.CAMERA.targetThreshold)) {
            indicator.classList.add('perfect');
            arrow.textContent = '✓';
            text.textContent = 'Perfekt! Foto aufnehmen';
        } else if (diff < 180) {
            indicator.classList.remove('perfect');
            arrow.textContent = '→';
            text.textContent = `${Math.round(diff)}° nach rechts drehen`;
        } else {
            indicator.classList.remove('perfect');
            arrow.textContent = '←';
            text.textContent = `${Math.round(360 - diff)}° nach links drehen`;
        }
    }

    /**
     * Take photo and render windrad overlay
     */
    takePhoto(turbine, userLocation, visibilityData, renderer) {
        const video = document.getElementById('cameraPreview');
        const canvas = document.getElementById('resultCanvas');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        
        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Draw windrad overlay
        renderer.setVisibilityData(visibilityData);
        renderer.drawWindrad(ctx, canvas.width, canvas.height, turbine, userLocation);
        
        // Download
        const dataURL = canvas.toDataURL('image/jpeg', 0.95);
        const link = document.createElement('a');
        link.download = `windrad_${turbine.name}_${Date.now()}.jpg`;
        link.href = dataURL;
        link.click();
        
        log('Photo taken and downloaded');
        
        // Trigger callback
        if (this.onPhotoTaken) {
            this.onPhotoTaken(dataURL);
        }
        
        this.stopCamera();
    }

    /**
     * Check if camera is active
     */
    isRunning() {
        return this.isActive;
    }
}
