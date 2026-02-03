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
            // Request compass permission first (iOS requirement)
            if (typeof DeviceOrientationEvent !== 'undefined' && 
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Kompass-Berechtigung wurde verweigert.');
                }
            }
            
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
            this.cameraStream = await navigator.mediaDevices.getUserMedia(
                CONFIG.CAMERA.videoConstraints
            );
            
            const video = document.getElementById('cameraPreview');
            video.srcObject = this.cameraStream;
            
            document.getElementById('cameraView').classList.add('active');
            this.isActive = true;
            
            // Setup orientation listeners
            this._setupOrientationListeners();
            
            log('Camera started');
            
        } catch (error) {
            console.error('Camera error:', error);
            throw new Error('Kamera konnte nicht gestartet werden: ' + error.message);
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
        // iOS uses webkitCompassHeading
        if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
            this.deviceOrientation = event.webkitCompassHeading;
        }
        // Android uses alpha (inverted)
        else if (event.alpha !== null) {
            this.deviceOrientation = 360 - event.alpha;
        }
        
        this._updateDirectionIndicator();
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
