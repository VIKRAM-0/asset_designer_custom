import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, description } = req.body || {};
  if (!description && !imageData) {
    return res.status(400).json({ error: 'Missing description or imageData' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
  }

  const prompt = `You are a 3D texture expert helping find PBR fabric textures.

${description ? `User description: "${description}"` : ''}
${imageData ? 'An image of the fabric/material is also provided above.' : ''}

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "keywords": ["word1", "word2", "word3"],
  "type": "fabric",
  "polyhavenIds": ["id1", "id2"],
  "summary": "one sentence"
}

Rules:
- "keywords": 3–6 specific searchable terms to find matching PBR textures on PolyHaven (focus on weave/pattern, texture, surface, color family, material class)
- "type": one of: fabric, leather, vinyl, linen, velvet, suede, cotton, wool, canvas, denim, wood, carpet
- "polyhavenIds": up to 3 snake_case PolyHaven texture IDs you are highly confident match. Known fabric IDs include: fabric_pattern_05, rough_linen, scuba_suede, brown_leather, hessian_230, caban, cotton_fabric, leather_white, jute, corduroy. Only include IDs you are certain about.
- "summary": one sentence describing the material`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: any[] = [];
    if (imageData) {
      parts.push({ inlineData: { data: imageData, mimeType: 'image/jpeg' } });
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ keywords: [], polyhavenIds: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({
      keywords:     Array.isArray(parsed.keywords)     ? parsed.keywords     : [],
      type:         typeof parsed.type === 'string'    ? parsed.type         : 'fabric',
      polyhavenIds: Array.isArray(parsed.polyhavenIds) ? parsed.polyhavenIds : [],
      summary:      typeof parsed.summary === 'string' ? parsed.summary      : '',
    });
  } catch (error: any) {
    console.error('find-fabric error:', error);
    // Return empty so client gracefully falls back to keyword search
    return res.status(200).json({ keywords: [], polyhavenIds: [], error: error.message });
  }
}
