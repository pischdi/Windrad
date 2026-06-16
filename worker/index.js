/**
 * ========================================
 * Windrad AR - AI Photo Analysis Worker
 * Cloudflare Worker with Gemini Vision API
 * ========================================
 *
 * Gemini analyzes the photo and provides scene data.
 * Frontend uses this data to render turbine more accurately.
 */

export default {
  async fetch(request, env) {
    // CORS headers for frontend
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Debug endpoint to list available models
    if (request.url.includes('/api/list-models')) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`
        );
        const data = await response.json();
        return new Response(JSON.stringify(data, null, 2), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders
      });
    }

    // Photo analysis endpoint (matches the frontend call)
    const url = new URL(request.url);
    if (url.pathname !== '/api/enhance-photo') {
      return new Response(JSON.stringify({
        error: 'Not found',
        hint: 'POST your image to /api/enhance-photo'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      // Parse request body
      const { image, metadata } = await request.json();

      if (!image || !metadata) {
        return new Response(JSON.stringify({
          error: 'Missing image or metadata'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Extract base64 image data (remove data URL prefix)
      const base64Image = image.split(',')[1];

      // Prepare prompt for Gemini
      const prompt = buildAnalysisPrompt(metadata);

      // Call Gemini Vision API for scene analysis
      const sceneData = await analyzeScene(
        base64Image,
        prompt,
        env.GEMINI_API_KEY
      );

      // Return scene analysis data
      return new Response(JSON.stringify({
        success: true,
        sceneData: sceneData,
        message: 'Scene analyzed successfully by Gemini Vision'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(JSON.stringify({
        error: error.message,
        details: error.stack
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Build analysis prompt for Gemini Vision API
 */
function buildAnalysisPrompt(metadata) {
  const { turbine, camera } = metadata;
  const elevationAngle = Math.atan((turbine.totalHeight - camera.altitude) / camera.distance) * (180 / Math.PI);

  return `You are an expert in computer vision, perspective geometry, and augmented reality.

TASK: Analyze this photograph and provide precise data for overlaying a wind turbine visualization.

WIND TURBINE DATA:
- Location: ${turbine.lat}°N, ${turbine.lon}°E
- Total Height: ${turbine.totalHeight}m (hub at ${turbine.hubHeight}m, rotor diameter ${turbine.rotorDiameter}m)

CAMERA DATA:
- Location: ${camera.lat}°N, ${camera.lng}°E
- Altitude: ${camera.altitude}m
- Distance to turbine: ${(camera.distance / 1000).toFixed(2)}km
- Calculated elevation angle: ${elevationAngle.toFixed(2)}°

ANALYSIS REQUIRED:
1. **Horizon Detection:**
   - Where is the horizon line in this image? (Y-position as percentage from top)
   - Is the camera tilted up or down? (estimated pitch angle)

2. **Foreground Objects:**
   - Identify objects that might occlude the turbine (buildings, trees, etc.)
   - For each object, estimate: position, height, distance
   - Will any foreground object block the turbine at elevation ${elevationAngle.toFixed(2)}°?

3. **Scene Understanding:**
   - Sky region vs terrain region
   - Lighting conditions (affects turbine rendering opacity)
   - Weather (affects visibility)

4. **Turbine Positioning Recommendation:**
   - Based on horizon position and elevation angle, where should the turbine appear? (X, Y as percentages)
   - Recommended size (as percentage of image height)
   - Opacity (0-100%) based on distance and weather

5. **Occlusion:**
   - Which parts of the turbine would be hidden? (none / bottom / middle / top)
   - Percentage visible (0-100%)

RESPOND IN JSON FORMAT:
\`\`\`json
{
  "horizon": {
    "yPosition": 0.52,
    "cameraPitch": -5
  },
  "foregroundObjects": [
    {
      "type": "building",
      "position": {"x": 0.3, "y": 0.6},
      "estimatedHeight": "6m",
      "estimatedDistance": "25m",
      "blocksTurbine": true
    }
  ],
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
  "lighting": "clear daylight",
  "confidence": 0.92
}
\`\`\`

Be precise and analytical. This data will be used to render the turbine accurately.`;
}

/**
 * Call Gemini Vision API for scene analysis
 * Using gemini-2.5-flash with v1beta API
 */
async function analyzeScene(base64Image, prompt, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Image
                }
              },
              {
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const analysisText = result.candidates[0].content.parts[0].text;

  // Extract JSON from Gemini's response
  const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  } else {
    // Fallback: try to parse the entire response as JSON
    try {
      return JSON.parse(analysisText);
    } catch (e) {
      // If not JSON, return as structured data
      return {
        rawAnalysis: analysisText,
        error: 'Could not parse JSON response',
        fallback: true
      };
    }
  }
}
