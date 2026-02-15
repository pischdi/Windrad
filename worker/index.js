/**
 * ========================================
 * Windrad AR - AI Photo Analysis Worker
 * Cloudflare Worker with Claude Vision API
 * ========================================
 *
 * Claude analyzes the photo and provides scene data.
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

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders
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

      // Prepare prompt for Claude
      const prompt = buildAnalysisPrompt(metadata);

      // Call Claude Vision API for scene analysis
      const sceneData = await analyzeScene(
        base64Image,
        prompt,
        env.ANTHROPIC_API_KEY
      );

      // Return scene analysis data
      return new Response(JSON.stringify({
        success: true,
        sceneData: sceneData,
        message: 'Scene analyzed successfully by Claude Vision'
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
 * Build analysis prompt for Claude Vision API
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
      "blocksT urbine": true
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
 * Call Claude Vision API for scene analysis
 */
async function analyzeScene(base64Image, prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const analysisText = result.content[0].text;

  // Extract JSON from Claude's response
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
