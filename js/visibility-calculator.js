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
     * Calculate visibility between user and turbine.
     *
     * Nutzt die Elevation API (/v1/line-of-sight + /v1/profile) als Single
     * Source of Truth. Die frühere lokale Sichtlinien-Rechnung war fehlerhaft
     * (Überhöhung gegen die Linie zur Spitze statt steilstem Sichtwinkel) und
     * wurde durch die korrekte Grazing-Angle-Methode der API ersetzt.
     */
    async calculateVisibility(userLat, userLon, turbineLat, turbineLon, turbineHeight) {
        try {
            const base = CONFIG.ELEVATION_API;
            const samples = CONFIG.ELEVATION.samples;
            const observer = `${userLat},${userLon},${CONFIG.USER_EYE_HEIGHT}`;
            const target = `${turbineLat},${turbineLon},${turbineHeight}`;

            // Verdikt + Profil parallel holen.
            const [losRes, profRes] = await Promise.all([
                fetch(`${base}/v1/line-of-sight?observer=${observer}&target=${target}&samples=${samples}`),
                fetch(`${base}/v1/profile?from=${userLat},${userLon}&to=${turbineLat},${turbineLon}&samples=${samples}`)
            ]);
            if (!losRes.ok) throw new Error('line-of-sight API: ' + losRes.status);
            if (!profRes.ok) throw new Error('profile API: ' + profRes.status);
            const los = await losRes.json();
            const prof = await profRes.json();

            // Profil in das von drawProfile erwartete Format ({lat,lng,elevation}).
            // nodata (null) per Forward-Fill ersetzen, damit das Chart nicht kippt.
            let lastEl = los.observer.groundElevation_m;
            const profile = prof.profile.map(p => {
                const elevation = p.elevation == null ? lastEl : p.elevation;
                lastEl = elevation;
                return { lat: p.lat, lng: p.lon, elevation };
            });
            profile.isDSM = true; // DOM (mit Bäumen/Gebäuden)

            const obstructionPoint = los.blockedAt ? {
                lat: los.blockedAt.lat,
                lng: los.blockedAt.lon,
                elevation: los.blockedAt.elevation,
                distance: los.blockedAt.distance_m,
                obstruction: Math.max(0, los.blockedAt.elevation - los.observer.eyeElevation_m)
            } : null;

            return {
                status: los.status,
                visiblePercentage: los.visiblePercent,
                visibleHeight: los.visibleHeight_m,
                totalHeight: turbineHeight,
                obstructionPoint: obstructionPoint,
                profile: profile,
                userElevation: los.observer.eyeElevation_m,
                turbineElevation: los.target.groundElevation_m,
                turbineTopElevation: los.target.topElevation_m,
                distance: los.distance_m,
                isDSM: true
            };

        } catch (error) {
            console.error('Visibility calculation error (Elevation API):', error);
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
