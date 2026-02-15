# Windrad AR - AI Worker Deployment

Cloudflare Worker für KI-basierte Foto-Analyse mit Claude Vision API.

## Funktionsweise

**Workflow:**
1. Frontend sendet Foto + Metadaten an `/api/enhance-photo`
2. Worker ruft Claude Vision API auf
3. Claude analysiert Szene: Horizont, Gebäude, Verdeckung
4. Worker gibt JSON-Daten zurück
5. Frontend rendert WKA neu mit KI-Daten

**NICHT:** Bildmodifikation (Claude kann keine Bilder erstellen)
**SONDERN:** Szenenanalyse → Frontend-Rendering

---

## Deployment

### 1. Prerequisites

```bash
# Wrangler CLI installieren (falls noch nicht)
npm install -g wrangler

# Login (falls noch nicht)
wrangler login
```

### 2. API Key setzen

```bash
cd worker

# API Key als Secret setzen
wrangler secret put ANTHROPIC_API_KEY

# Wenn gefragt, Claude API Key eingeben
# (von https://console.anthropic.com/settings/keys)
```

### 3. Worker deployen

```bash
# Development
wrangler deploy

# Production
wrangler deploy --env production
```

### 4. Route einrichten

**Option A: Automatisch (via wrangler.toml)**
- Bereits konfiguriert: `windrad.pages.dev/api/*`

**Option B: Manuell im Dashboard**
1. Cloudflare Dashboard öffnen
2. Workers & Pages → windrad-ai-worker
3. Settings → Triggers → Add Route
4. Route: `windrad.pages.dev/api/*`

---

## Testing

### Lokales Testen

```bash
# Worker lokal starten
wrangler dev

# In anderem Terminal:
curl -X POST http://localhost:8787/api/enhance-photo \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

### Production Testen

```bash
curl -X POST https://windrad.pages.dev/api/enhance-photo \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,...",
    "metadata": {
      "turbine": {
        "lat": 51.6905,
        "lon": 14.4519,
        "hubHeight": 165,
        "rotorDiameter": 170,
        "totalHeight": 250
      },
      "camera": {
        "lat": 51.65,
        "lng": 14.42,
        "altitude": 1.8,
        "distance": 2300
      }
    }
  }'
```

**Erwartete Response:**
```json
{
  "success": true,
  "sceneData": {
    "horizon": {
      "yPosition": 0.52,
      "cameraPitch": -5
    },
    "foregroundObjects": [...],
    "turbinePosition": {
      "x": 0.5,
      "y": 0.45,
      "sizePercent": 0.15,
      "opacity": 85
    },
    "occlusion": {
      "status": "partial",
      "visiblePercent": 60,
      "hiddenParts": "bottom"
    },
    "confidence": 0.92
  }
}
```

---

## Kosten

**Claude API Pricing (Stand 2026):**
- Modell: `claude-3-5-sonnet-20241022`
- Input: ~$3 per 1M tokens
- Output: ~$15 per 1M tokens
- Images: ~1000 tokens per image

**Pro Anfrage:**
- Image: ~1000 tokens
- Prompt: ~500 tokens
- Response: ~500 tokens
- **Total: ~2000 tokens ≈ $0.03**

**Bei 100 Anfragen/Monat:**
- Kosten: ~$3/Monat
- Cloudflare Workers: Free Tier (100k req/day)

---

## Monitoring

### Logs ansehen

```bash
# Live logs
wrangler tail

# Production logs
wrangler tail --env production
```

### Metrics im Dashboard

1. Cloudflare Dashboard → Workers & Pages → windrad-ai-worker
2. Metrics → Analytics

**Wichtige Metriken:**
- Requests/Minute
- CPU Time
- Errors
- Success Rate

---

## Troubleshooting

### Error: "Failed to fetch"
- **Ursache:** CORS nicht konfiguriert
- **Lösung:** Prüfe `corsHeaders` in index.js

### Error: "Claude API error: 401"
- **Ursache:** API Key falsch/fehlt
- **Lösung:** `wrangler secret put ANTHROPIC_API_KEY`

### Error: "CPU exceeded"
- **Ursache:** Claude API zu langsam
- **Lösung:** Erhöhe `cpu_ms` in wrangler.toml

### Keine Route gefunden
- **Ursache:** Route nicht konfiguriert
- **Lösung:** Dashboard → Routes → Add Route

---

## Development

### Code-Struktur

```
worker/
├── index.js          # Main worker code
├── wrangler.toml     # Configuration
└── README.md         # This file
```

**Wichtige Funktionen:**
- `buildAnalysisPrompt()` - Erstellt Prompt für Claude
- `analyzeScene()` - Ruft Claude API auf
- `export default { fetch }` - Worker entry point

### Prompt optimieren

**Aktueller Prompt:** [worker/index.js](index.js#L75-L150)

**Optimierungen:**
1. Spezifischere Objekt-Erkennung
2. Bessere Elevations-Berechnung
3. Wetterbasierte Sichtbarkeit
4. Tageszeit-Anpassungen

---

## Next Steps

- [ ] A/B Test: Lokal vs. AI
- [ ] Caching für gleiche Positionen
- [ ] Batch-Processing für mehrere Fotos
- [ ] Fine-tuning auf Windrad-Fotos
- [ ] Custom Vision Model (zukünftig)

---

**API Key sicher aufbewahren!**
Niemals in Git committen - nur via `wrangler secret put`.
