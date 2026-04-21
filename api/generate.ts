import { GoogleGenAI } from '@google/genai';

const PRODUCT_PROMPT = `You are a professional interior design renderer. Place this furniture piece as the clear focal point in a beautifully staged, modern living room.

Rules you must follow:
- The furniture must face the camera directly — never face away from the viewer
- The furniture is the hero of the image — centred, well-lit, and dominant in the frame
- The living room is staged around the furniture: a rug beneath it, soft ambient lighting from above and the sides, a tasteful background with walls, artwork, and plants
- NO television, screens, or media units in the scene — this is a showroom-style render
- The camera angle is a slight 3/4 front view at eye level, as if a customer is viewing it in a showroom
- Preserve the furniture's exact fabric texture, colour, pattern, and material from the input image — do not change or improve it
- Photorealistic, 8K quality, soft natural lighting`;

const ROOM_PROMPT = `You are a professional architectural interior renderer. The input image is a 3D scene of a living room. Convert it into a photorealistic editorial photograph of the same room.

Rules you must follow:
- Preserve the EXACT layout, camera angle, and composition of the input — do not move, rotate, add, or remove any furniture, walls, windows, rugs, plants, or decor
- Preserve the EXACT fabric textures, colours, patterns, and materials on every piece of furniture — especially the sofa and accent chair upholstery
- Preserve the wall colours, floor material, curtains, shelving, and all existing decor exactly as shown
- Upgrade only the realism: add true-to-life lighting (soft daylight from the windows, subtle warm ambient fill), accurate material response (fabric weave, wood grain, ceramic sheen), realistic shadows and contact shadows under furniture, subtle global illumination bounce
- NO television, screens, or media units
- Photorealistic, 8K quality, magazine editorial style, shallow depth of field acceptable but the focal furniture must stay sharp
- Do NOT stylise, cartoonify, or change the colour palette`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, mode } = req.body || {};
  if (!imageData) {
    return res.status(400).json({ error: 'Missing imageData' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
  }

  const prompt = mode === 'room' ? ROOM_PROMPT : PRODUCT_PROMPT;
  // Room mode needs better layout/texture preservation → Nano Banana 2
  // Product mode is a simpler single-subject render → Nano Banana (cheaper)
  const model = mode === 'room' ? 'gemini-3.1-flash-image-preview' : 'gemini-2.5-flash-image';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              data: imageData,
              mimeType: 'image/jpeg',
            },
          },
          { text: prompt },
        ],
      },
    });

    let generatedImageUrl: string | null = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!generatedImageUrl) {
      return res.status(500).json({ error: 'No generated image returned' });
    }

    return res.status(200).json({ imageUrl: generatedImageUrl });
  } catch (error) {
    console.error('generate API error:', error);
    return res.status(500).json({ error: 'Failed to generate image' });
  }
}
