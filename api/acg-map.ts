// Proxy that downloads an AmbientCG texture ZIP package and returns a single map file.
// GET /api/acg-map?id=Fabric001&map=Color&res=1K
// map values: Color | NormalGL | Roughness | Displacement | AmbientOcclusion
// res values: 1K | 2K (1K recommended for web use)

import JSZip from 'jszip';

const MAP_PATTERNS: Record<string, RegExp> = {
  Color:            /[_-]color\.jpg$/i,
  NormalGL:         /[_-]normalgl\.jpg$/i,
  Normal:           /[_-](normalgl|normal_opengl|normal)\.jpg$/i,
  Roughness:        /[_-]roughness\.jpg$/i,
  Displacement:     /[_-](displacement|height)\.jpg$/i,
  AmbientOcclusion: /[_-](ao|ambientocclusion)\.jpg$/i,
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, map = 'Color', res: resolution = '1K' } = req.query;
  if (!id) return res.status(400).json({ error: 'missing id' });

  const assetId = (id as string).trim();
  const mapKey  = (map as string) as keyof typeof MAP_PATTERNS;
  // New URL format: get?file={id}_{res}-JPG.zip  (old get?q=...&d=... redirects to wrong asset)
  const zipUrl  = `https://ambientcg.com/get?file=${encodeURIComponent(assetId)}_${resolution}-JPG.zip`;

  console.log(`[acg-map] fetching ${assetId} / ${mapKey} @ ${resolution} — ${zipUrl}`);

  try {
    const upstream = await fetch(zipUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FabricConfigBot/1.0)',
        'Accept': '*/*',
      },
    });

    if (!upstream.ok) {
      console.error(`[acg-map] AmbientCG returned ${upstream.status}`);
      return res.status(upstream.status).json({ error: `AmbientCG returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // AmbientCG redirected to an error/login page
      return res.status(502).json({ error: 'AmbientCG returned an HTML page — asset may not exist' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    console.log(`[acg-map] ZIP size: ${(buffer.length / 1024).toFixed(0)} KB`);

    const zip = await JSZip.loadAsync(buffer);

    // Build list of all JPG files in the ZIP (skip directories and metadata)
    const jpgFiles = Object.entries(zip.files as Record<string, JSZip.JSZipObject>)
      .filter(([, f]) => !f.dir && /\.jpg$/i.test(f.name));

    console.log('[acg-map] files in zip:', jpgFiles.map(([n]) => n));

    // Match against known map patterns, then fall back to generic regex
    const pattern = MAP_PATTERNS[mapKey] ?? new RegExp(`[_-]${mapKey}\\.jpg$`, 'i');
    let match = jpgFiles.find(([name]) => pattern.test(name));

    if (!match) {
      // Last-resort: fuzzy match on the map key name inside the filename
      match = jpgFiles.find(([name]) =>
        name.toLowerCase().includes((mapKey as string).toLowerCase())
      );
    }

    if (!match) {
      return res.status(404).json({
        error: `Map "${mapKey}" not found in AmbientCG package for "${assetId}"`,
        available: jpgFiles.map(([n]) => n),
      });
    }

    const imageBuffer: Buffer = await match[1].async('nodebuffer');
    console.log(`[acg-map] serving ${match[0]} — ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', imageBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    return res.end(imageBuffer);

  } catch (e: any) {
    console.error('[acg-map] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
