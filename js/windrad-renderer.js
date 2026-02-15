/**
 * ========================================
 * WINDRAD RENDERER
 * 3D Wind Turbine Overlay on Photos
 * ======================================== */

class WindradRenderer {
    constructor() {
        this.visibilityData = null;
    }

    /**
     * Set current visibility data
     */
    setVisibilityData(data) {
        this.visibilityData = data;
    }

    /**
     * Draw windrad overlay on canvas
     */
    drawWindrad(ctx, width, height, turbine, userLocation, orientationData = null) {
        if (!turbine || !userLocation) return;

        const distance = calcDistance(
            userLocation.lat, userLocation.lng,
            turbine.lat, turbine.lon
        );
        const distanceMeters = distance * 1000;

        // Calculate turbine dimensions
        let totalHeight = turbine.hubHeight + (turbine.rotorDiameter / 2);
        let visibleHeight = totalHeight;
        let drawFromBottom = true;

        // Apply visibility data if available
        if (this.visibilityData) {
            if (this.visibilityData.status === 'blocked') {
                this._drawBlockedMessage(ctx, width, height);
                return;
            }

            if (this.visibilityData.status === 'partial') {
                visibleHeight = this.visibilityData.visibleHeight;
                drawFromBottom = false; // Draw from top
            }
        }

        // Calculate pixel size based on angular size (field of view)
        // Typical smartphone camera FOV: 60-70 degrees vertical
        const fov = 65; // degrees (vertical field of view)
        const angularSizeDeg = Math.atan(visibleHeight / distanceMeters) * (180 / Math.PI);
        const pixelHeight = Math.max(50, Math.min(height * 0.9, (angularSizeDeg / fov) * height * 1.5));

        // Calculate horizontal position based on camera orientation
        let x = width / 2; // Default: center

        // Check if AI provides position override
        if (orientationData && orientationData.aiPosition) {
            // Use AI-determined position
            x = orientationData.aiPosition.x * width;
        } else if (orientationData && orientationData.deviceHeading !== undefined && orientationData.targetBearing !== undefined) {
            // Calculate angle difference (how far off-center the turbine is)
            let angleDiff = orientationData.targetBearing - orientationData.deviceHeading;

            // Normalize to -180 to +180 range
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;

            // Horizontal FOV for smartphones is typically 80-90 degrees
            const horizontalFOV = 85; // degrees

            // Convert angle to pixel offset
            // If angle > FOV/2, turbine is out of frame (but we'll still show it partially)
            const maxAngle = horizontalFOV / 2;
            const normalizedAngle = Math.max(-maxAngle, Math.min(maxAngle, angleDiff));
            const pixelOffset = (normalizedAngle / horizontalFOV) * width;

            x = (width / 2) + pixelOffset;
        }

        // Calculate vertical position based on elevation angle and camera pitch
        let y = height * 0.75; // Default: lower third

        // Check if AI provides position override
        if (orientationData && orientationData.aiPosition) {
            // Use AI-determined position
            y = orientationData.aiPosition.y * height;

            // Override size if AI provides it
            if (orientationData.aiPosition.sizePercent) {
                const aiPixelHeight = orientationData.aiPosition.sizePercent * height;
                // Update pixelHeight for AI recommendation
                pixelHeight = Math.max(50, Math.min(height * 0.9, aiPixelHeight));
            }
        } else if (orientationData && orientationData.devicePitch !== undefined && orientationData.cameraHeight !== undefined) {
            // Calculate elevation angle to turbine top
            const cameraHeight = orientationData.cameraHeight;
            const turbineTopHeight = totalHeight;
            const heightDifference = turbineTopHeight - cameraHeight;

            // Elevation angle in degrees (positive = above horizon)
            const elevationAngle = Math.atan(heightDifference / distanceMeters) * (180 / Math.PI);

            // Camera pitch: positive when tilting down, negative when tilting up
            // For photo rendering, we want: pitch=0 means horizon at center
            const cameraPitch = orientationData.devicePitch;

            // Vertical FOV
            const verticalFOV = fov; // 65 degrees

            // Calculate horizon line position
            // When pitch = 0, horizon is at center
            // When pitch = +30 (tilting down), horizon moves up in frame
            // When pitch = -30 (tilting up), horizon moves down in frame
            const horizonY = (height / 2) - (cameraPitch / verticalFOV) * height;

            // Position turbine relative to horizon based on elevation angle
            // Positive elevation = above horizon = higher in frame (lower Y)
            const turbineOffsetFromHorizon = -(elevationAngle / verticalFOV) * height;
            y = horizonY + turbineOffsetFromHorizon;

            // Clamp to keep turbine in frame
            y = Math.max(pixelHeight / 2, Math.min(height - 50, y));

            // DEBUG: Draw horizon line
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(0, horizonY);
            ctx.lineTo(width, horizonY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw horizon label
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.font = '12px Arial';
            ctx.fillText(`Horizont (Pitch: ${cameraPitch.toFixed(1)}°)`, 10, horizonY - 5);

            // Draw elevation info
            ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.fillText(`Elevation: ${elevationAngle.toFixed(2)}° | Y: ${y.toFixed(0)}px`, 10, 30);
            ctx.fillText(`Höhe: ${heightDifference.toFixed(0)}m / ${distanceMeters.toFixed(0)}m`, 10, 45);
            ctx.restore();
        }

        // Proportions
        const towerWidth = pixelHeight * 0.06;
        const hubRadius = pixelHeight * 0.05;
        const bladeLength = (turbine.rotorDiameter / 2 / visibleHeight) * pixelHeight;
        const bladeWidth = pixelHeight * 0.03;
        
        let towerHeight, hubY;
        
        if (drawFromBottom) {
            // Draw from bottom (normal case)
            towerHeight = (turbine.hubHeight / visibleHeight) * pixelHeight;
            hubY = y - towerHeight;
        } else {
            // Draw from top (partially visible)
            towerHeight = pixelHeight * 0.7;
            hubY = y - pixelHeight + hubRadius;
        }
        
        // Draw tower
        this._drawTower(ctx, x, y, towerWidth, towerHeight, drawFromBottom, pixelHeight);
        
        // Draw nacelle
        this._drawNacelle(ctx, x, hubY, towerWidth, hubRadius);
        
        // Draw hub
        this._drawHub(ctx, x, hubY, hubRadius);
        
        // Draw rotor blades
        this._drawRotorBlades(ctx, x, hubY, bladeLength, bladeWidth, hubRadius);
        
        // Draw label
        this._drawLabel(ctx, x, y + 50, width, turbine, distance, visibleHeight);

        // Draw DSM warning if using fallback
        if (this.visibilityData && !this.visibilityData.isDSM) {
            this._drawDSMWarning(ctx, width);
        }
    }

    /**
     * Draw tower with gradient
     */
    _drawTower(ctx, x, y, towerWidth, towerHeight, fromBottom, totalHeight) {
        const towerGradient = ctx.createLinearGradient(x - towerWidth/2, 0, x + towerWidth/2, 0);
        towerGradient.addColorStop(0, 'rgba(180, 180, 180, 0.95)');
        towerGradient.addColorStop(0.3, 'rgba(220, 220, 220, 0.95)');
        towerGradient.addColorStop(1, 'rgba(240, 240, 240, 0.95)');
        
        ctx.fillStyle = towerGradient;
        if (fromBottom) {
            ctx.fillRect(x - towerWidth/2, y, towerWidth, -towerHeight);
        } else {
            ctx.fillRect(x - towerWidth/2, y - totalHeight, towerWidth, totalHeight * 0.7);
        }
        
        // Tower segments
        const segments = Math.floor(towerHeight / 40);
        ctx.strokeStyle = 'rgba(160, 160, 160, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 1; i < segments; i++) {
            const segmentY = fromBottom ? 
                y - (towerHeight / segments) * i :
                y - totalHeight + (towerHeight / segments) * i;
            ctx.beginPath();
            ctx.moveTo(x - towerWidth/2, segmentY);
            ctx.lineTo(x + towerWidth/2, segmentY);
            ctx.stroke();
        }
        
        // Tower outline
        ctx.strokeStyle = 'rgba(160, 160, 160, 0.8)';
        ctx.lineWidth = 2;
        if (fromBottom) {
            ctx.strokeRect(x - towerWidth/2, y, towerWidth, -towerHeight);
        } else {
            ctx.strokeRect(x - towerWidth/2, y - totalHeight, towerWidth, totalHeight * 0.7);
        }
    }

    /**
     * Draw nacelle (generator housing)
     */
    _drawNacelle(ctx, x, hubY, towerWidth, hubRadius) {
        const nacelleWidth = towerWidth * 2.5;
        const nacelleHeight = hubRadius * 2.5;
        const nacelleY = hubY - hubRadius;
        
        const nacelleGradient = ctx.createLinearGradient(x, nacelleY, x, nacelleY + nacelleHeight);
        nacelleGradient.addColorStop(0, 'rgba(245, 245, 245, 0.98)');
        nacelleGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
        nacelleGradient.addColorStop(1, 'rgba(230, 230, 230, 0.98)');
        
        ctx.fillStyle = nacelleGradient;
        ctx.fillRect(x - nacelleWidth/2, nacelleY, nacelleWidth, nacelleHeight);
        
        // Nacelle shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(x - nacelleWidth/2, nacelleY + nacelleHeight - 2, nacelleWidth, 4);
    }

    /**
     * Draw hub with 3D effect
     */
    _drawHub(ctx, x, hubY, hubRadius) {
        const hubGradient = ctx.createRadialGradient(
            x - hubRadius/3, hubY - hubRadius/3, hubRadius/4,
            x, hubY, hubRadius
        );
        hubGradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        hubGradient.addColorStop(0.5, 'rgba(230, 230, 230, 0.98)');
        hubGradient.addColorStop(1, 'rgba(200, 200, 200, 0.98)');
        
        ctx.fillStyle = hubGradient;
        ctx.beginPath();
        ctx.arc(x, hubY, hubRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /**
     * Draw rotor blades (3 blades at 120° intervals)
     */
    _drawRotorBlades(ctx, x, hubY, bladeLength, bladeWidth, hubRadius) {
        for (let i = 0; i < 3; i++) {
            const angle = (i * 120) * Math.PI / 180;
            const bladeX = x + Math.sin(angle) * bladeLength;
            const bladeY = hubY + Math.cos(angle) * bladeLength;
            
            // Blade shadow
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = bladeWidth + 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x + 2, hubY + 2);
            ctx.lineTo(bladeX + 2, bladeY + 2);
            ctx.stroke();
            
            // Blade gradient
            const bladeGradient = ctx.createLinearGradient(x, hubY, bladeX, bladeY);
            bladeGradient.addColorStop(0, 'rgba(245, 245, 245, 0.98)');
            bladeGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
            bladeGradient.addColorStop(1, 'rgba(235, 235, 235, 0.95)');
            
            ctx.strokeStyle = bladeGradient;
            ctx.lineWidth = bladeWidth;
            ctx.beginPath();
            ctx.moveTo(x, hubY);
            ctx.lineTo(bladeX, bladeY);
            ctx.stroke();
            
            // Blade edge highlight
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = bladeWidth * 0.3;
            ctx.stroke();
        }
    }

    /**
     * Draw label with turbine info
     */
    _drawLabel(ctx, x, labelY, width, turbine, distance, visibleHeight) {
        const labelPadding = 15;
        const labelText = turbine.name;
        const distText = `📏 ${formatDistance(distance)}`;
        const heightText = `⚡ ${Math.round(visibleHeight)}m`;
        
        ctx.font = 'bold 24px Arial';
        const textWidth = Math.max(
            ctx.measureText(labelText).width,
            ctx.measureText(distText).width + ctx.measureText(heightText).width + 20
        );
        const labelWidth = Math.min(textWidth + labelPadding * 2, width * 0.9);
        const labelHeight = 90;
        
        // Label background with gradient
        const labelGradient = ctx.createLinearGradient(x, labelY, x, labelY + labelHeight);
        labelGradient.addColorStop(0, 'rgba(26, 95, 59, 0.95)');
        labelGradient.addColorStop(1, 'rgba(46, 125, 78, 0.95)');
        
        ctx.fillStyle = labelGradient;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fillRect(x - labelWidth/2, labelY, labelWidth, labelHeight);
        ctx.shadowColor = 'transparent';
        
        // Label border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - labelWidth/2, labelY, labelWidth, labelHeight);
        
        // Label text
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, x, labelY + 30);
        
        ctx.font = '18px Arial';
        ctx.fillText(distText, x - 60, labelY + 60);
        ctx.fillText(heightText, x + 60, labelY + 60);
        
        // Visibility indicator
        if (this.visibilityData && this.visibilityData.status === 'partial') {
            ctx.font = 'bold 16px Arial';
            ctx.fillStyle = '#ff9800';
            ctx.fillText(
                `⚠️ ${Math.round(this.visibilityData.visiblePercentage)}% sichtbar`,
                x,
                labelY + 80
            );
        }
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    /**
     * Draw blocked message
     */
    _drawBlockedMessage(ctx, width, height) {
        ctx.fillStyle = 'rgba(244, 67, 54, 0.9)';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText('⛰️ Durch Gelände verdeckt', width / 2, 100);
        ctx.shadowColor = 'transparent';
    }

    /**
     * Draw DSM warning (when using DTM fallback without trees/buildings)
     */
    _drawDSMWarning(ctx, width) {
        const padding = 15;
        const warningHeight = 60;
        const warningWidth = Math.min(width * 0.9, 500);
        const x = width / 2;
        const y = 20;

        // Warning background
        ctx.fillStyle = 'rgba(255, 152, 0, 0.95)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fillRect(x - warningWidth/2, y, warningWidth, warningHeight);
        ctx.shadowColor = 'transparent';

        // Warning border
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - warningWidth/2, y, warningWidth, warningHeight);

        // Warning text
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ Ohne Wald-/Gebäudedaten', x, y + 25);

        ctx.font = '14px Arial';
        ctx.fillText('LAZ-Daten für präzise Sichtbarkeit benötigt', x, y + 45);

        ctx.shadowColor = 'transparent';
    }
}
