// Server-side proxy for AmbientCG search API (avoids browser CORS block)
// GET /api/acg-search?q=leather&limit=14

export default async function handler(req: any, res: any) {
  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const q     = (req.query.q     as string) || 'fabric';
  const limit = Math.min(Number(req.query.limit) || 14, 30);

  const url = `https://ambientcg.com/api/v2/full_json?include=downloadData&type=Atlas&sort=Popular&limit=${limit}&q=${encodeURIComponent(q)}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FabricConfigBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ foundAssets: [], error: `AmbientCG returned ${upstream.status}` });
    }

    const data = await upstream.json();
    // Short cache — search results change rarely
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[acg-search] error:', e.message);
    return res.status(200).json({ foundAssets: [], error: e.message });
  }
}
