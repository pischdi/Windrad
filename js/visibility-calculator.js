/**
 * ========================================
 * VISIBILITY CALCULATOR
 * Calculates visibility based on elevation profile
 * ======================================== */

class VisibilityCalculator {
    constructor(elevationService) {
        this.elevationService = elevationService;
    }

    /**
     * Calculate visibility between user and turbine
     */
    async calculateVisibility(userLat, userLon, turbineLat, turbineLon, turbineHeight) {
        try {
            // Get elevation profile
            const profile = await this.elevationService.getProfile(
                userLat, userLon,
                turbineLat, turbineLon,
                CONFIG.ELEVATION.samples
            );

            // Calculate distance in meters
            const distance = calcDistance(userLat, userLon, turbineLat, turbineLon) * 1000;
            
            // User elevation (eye level)
            const userElevation = profile[0].elevation + CONFIG.USER_EYE_HEIGHT;
            
            // Turbine elevation
            const turbineElevation = profile[profile.length - 1].elevation;
            const turbineTopElevation = turbineElevation + turbineHeight;
            
            // Calculate sight line
            const sightLineSlope = (turbineTopElevation - userElevation) / distance;
            
            // Check each point for obstruction
            let maxObstruction = 0;
            let obstructionPoint = null;
            
            for (let i = 1; i < profile.length - 1; i++) {
                const pointDistance = (distance / (profile.length - 1)) * i;
                const sightLineHeight = userElevation + (sightLineSlope * pointDistance);
                const terrainHeight = profile[i].elevation;
                
                if (terrainHeight > sightLineHeight) {
                    const obstruction = terrainHeight - sightLineHeight;
                    if (obstruction > maxObstruction) {
                        maxObstruction = obstruction;
                        obstructionPoint = {
                            lat: profile[i].lat,
                            lng: profile[i].lng,
                            elevation: terrainHeight,
                            distance: pointDistance,
                            obstruction: obstruction
                        };
                    }
                }
            }
            
            // Calculate visible height
            let visibleHeight = turbineHeight;
            let visiblePercentage = 100;
            let status = 'visible';
            
            if (obstructionPoint) {
                // Calculate how much is blocked
                const blockedHeight = Math.max(0, obstructionPoint.elevation - userElevation - 
                    (sightLineSlope * obstructionPoint.distance));
                visibleHeight = Math.max(0, turbineHeight - blockedHeight);
                visiblePercentage = (visibleHeight / turbineHeight) * 100;
                
                if (visiblePercentage < CONFIG.VISIBILITY.blockedThreshold) {
                    status = 'blocked';
                } else if (visiblePercentage < CONFIG.VISIBILITY.partialThreshold) {
                    status = 'partial';
                }
            }
            
            return {
                status: status,
                visiblePercentage: visiblePercentage,
                visibleHeight: visibleHeight,
                totalHeight: turbineHeight,
                obstructionPoint: obstructionPoint,
                profile: profile,
                userElevation: userElevation,
                turbineElevation: turbineElevation,
                turbineTopElevation: turbineTopElevation,
                distance: distance,
                isDSM: profile.isDSM || false  // Digital Surface Model (with trees/buildings)
            };
            
        } catch (error) {
            console.error('Visibility calculation error:', error);
            return null;
        }
    }

    /**
     * Draw elevation profile on canvas
     */
    drawProfile(canvas, visibilityData) {
        const ctx = canvas.getContext('2d');

        // Set canvas size (größer für bessere Lesbarkeit)
        canvas.width = canvas.offsetWidth;
        canvas.height = 220;

        const profile = visibilityData.profile;
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 60 };
        
        // Clear canvas
        ctx.fillStyle = '#f9f9f9';
        ctx.fillRect(0, 0, width, height);
        
        // Find min/max elevations
        const minElevation = Math.min(...profile.map(p => p.elevation));
        const maxElevation = Math.max(
            visibilityData.turbineTopElevation,
            ...profile.map(p => p.elevation)
        );
        const elevationRange = maxElevation - minElevation;
        
        // Scale functions
        const scaleX = (index) => padding.left + (index / (profile.length - 1)) * (width - padding.left - padding.right);
        const scaleY = (elevation) => height - padding.bottom - ((elevation - minElevation) / elevationRange) * (height - padding.top - padding.bottom);
        
        // Draw terrain
        ctx.beginPath();
        ctx.moveTo(scaleX(0), scaleY(profile[0].elevation));
        for (let i = 1; i < profile.length; i++) {
            ctx.lineTo(scaleX(i), scaleY(profile[i].elevation));
        }
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Fill terrain
        ctx.lineTo(scaleX(profile.length - 1), height - padding.bottom);
        ctx.lineTo(scaleX(0), height - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = 'rgba(121, 85, 72, 0.2)';
        ctx.fill();

        // Draw Y-axis grid lines and labels
        const numGridLines = 4;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#666';
        ctx.font = '11px Arial';
        ctx.textAlign = 'right';

        for (let i = 0; i <= numGridLines; i++) {
            const elevation = minElevation + (elevationRange / numGridLines) * i;
            const y = scaleY(elevation);

            // Grid line
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            ctx.fillText(Math.round(elevation) + 'm', padding.left - 5, y + 4);
        }

        // Draw sight line
        ctx.beginPath();
        ctx.moveTo(scaleX(0), scaleY(visibilityData.userElevation));
        ctx.lineTo(scaleX(profile.length - 1), scaleY(visibilityData.turbineTopElevation));
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw turbine
        const turbineX = scaleX(profile.length - 1);
        const turbineBaseY = scaleY(visibilityData.turbineElevation);
        const turbineTopY = scaleY(visibilityData.turbineTopElevation);
        
        ctx.beginPath();
        ctx.moveTo(turbineX, turbineBaseY);
        ctx.lineTo(turbineX, turbineTopY);
        ctx.strokeStyle = '#1a5f3b';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw visible portion if partially blocked
        if (visibilityData.status === 'partial' && visibilityData.obstructionPoint) {
            const visibleStartY = scaleY(visibilityData.turbineElevation + 
                (visibilityData.totalHeight - visibilityData.visibleHeight));
            ctx.beginPath();
            ctx.moveTo(turbineX, visibleStartY);
            ctx.lineTo(turbineX, turbineTopY);
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 6;
            ctx.stroke();
        }
        
        // Draw obstruction point if exists
        if (visibilityData.obstructionPoint) {
            const obstIndex = Math.round((visibilityData.obstructionPoint.distance / 
                visibilityData.distance) * (profile.length - 1));
            const obstX = scaleX(obstIndex);
            const obstY = scaleY(visibilityData.obstructionPoint.elevation);
            
            ctx.fillStyle = '#f44336';
            ctx.beginPath();
            ctx.arc(obstX, obstY, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw labels (größer und deutlicher)
        ctx.fillStyle = '#333';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';

        // Beobachter-Label
        const observerY = scaleY(visibilityData.userElevation);
        ctx.fillText('Beobachter', padding.left + 5, observerY - 12);
        ctx.font = '11px Arial';
        ctx.fillText(Math.round(visibilityData.userElevation) + 'm', padding.left + 5, observerY + 2);

        // Windrad-Label
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('Windrad', turbineX - 8, turbineTopY - 12);
        ctx.font = '11px Arial';
        ctx.fillText(Math.round(visibilityData.turbineTopElevation) + 'm', turbineX - 8, turbineTopY + 2);
    }

    /**
     * Get visibility status text
     */
    getStatusText(visibilityData) {
        if (!visibilityData) {
            return {
                icon: '❓',
                title: 'Unbekannt',
                description: 'Keine Daten verfügbar',
                obstacle: ''
            };
        }

        const percent = Math.round(visibilityData.visiblePercentage);
        const visHeight = Math.round(visibilityData.visibleHeight);
        const totHeight = Math.round(visibilityData.totalHeight);
        const obstDist = visibilityData.obstructionPoint ? 
            Math.round(visibilityData.obstructionPoint.distance) : 0;

        switch (visibilityData.status) {
            case 'visible':
                return {
                    icon: '✅',
                    title: 'Komplett sichtbar',
                    description: 'Das Windrad ist vollständig sichtbar.',
                    obstacle: 'Keine Geländebehinderung.'
                };
            
            case 'partial':
                return {
                    icon: '⚠️',
                    title: 'Teilweise sichtbar',
                    description: `${percent}% des Windrads sind sichtbar (${visHeight}m von ${totHeight}m).`,
                    obstacle: `Gelände blockiert die Sicht in ${obstDist}m Entfernung.`
                };
            
            case 'blocked':
                return {
                    icon: '❌',
                    title: 'Nicht sichtbar',
                    description: 'Das Windrad wird durch das Gelände verdeckt.',
                    obstacle: obstDist ? `Blockiert in ${obstDist}m Entfernung.` : ''
                };
            
            default:
                return {
                    icon: '❓',
                    title: 'Unbekannt',
                    description: 'Status konnte nicht ermittelt werden.',
                    obstacle: ''
                };
        }
    }
}
