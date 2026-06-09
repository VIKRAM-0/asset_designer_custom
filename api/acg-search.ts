// Server-side proxy for AmbientCG v3 search API (avoids browser CORS block)
// GET /api/acg-search?q=leather&limit=20

export default async function handler(req: any, res: any) {
  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const q     = (req.query.q as string) || 'fabric';
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  // Restrict to upholstery-relevant categories — avoids stones, bricks, etc.
  const FABRIC_CATS = 'Fabric,Leather,Carpet,Foam,AcousticFoam';
  const url = `https://ambientcg.com/api/v3/assets?type=material&category=${FABRIC_CATS}&sort=popular&limit=${limit}&include=downloads,previews&q=${encodeURIComponent(q)}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FabricConfigBot/1.0)' },
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) {
      console.error(`[acg-search] AmbientCG returned ${upstream.status} for: ${url}`);
      return res.status(upstream.status).json({ foundAssets: [], error: `AmbientCG returned ${upstream.status}` });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[acg-search] error:', e.message);
    return res.status(200).json({ foundAssets: [], error: e.message });
  }
}
