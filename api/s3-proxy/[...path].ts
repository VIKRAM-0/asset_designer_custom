import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: any, res: any) {
  console.log('[s3-proxy] hit —', req.method, req.url);
  console.log('[s3-proxy] query.path =', JSON.stringify(req.query.path));
  console.log('[s3-proxy] env check — bucket:', process.env.S3_BUCKET, 'region:', process.env.AWS_REGION, 'key_set:', !!process.env.AWS_ACCESS_KEY_ID, 'secret_set:', !!process.env.AWS_SECRET_ACCESS_KEY);

  const parts = req.query.path;
  if (!parts) {
    console.log('[s3-proxy] ERROR: no path param');
    return res.status(400).json({ error: 'missing path' });
  }

  const key = 'fabric_assets/' + (Array.isArray(parts) ? parts.join('/') : parts);
  console.log('[s3-proxy] fetching S3 key:', key);

  try {
    const { Body, ContentType, ContentLength } = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })
    );

    console.log('[s3-proxy] S3 OK — ContentType:', ContentType, 'ContentLength:', ContentLength);

    res.setHeader('Content-Type', ContentType || 'application/octet-stream');
    if (ContentLength) res.setHeader('Content-Length', String(ContentLength));
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (Body instanceof Readable) {
      console.log('[s3-proxy] streaming via Node Readable');
      Body.pipe(res);
    } else if (Body) {
      console.log('[s3-proxy] streaming via Web ReadableStream');
      const reader = (Body as any).getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
        await pump();
      };
      await pump();
    } else {
      console.log('[s3-proxy] ERROR: no body returned');
      res.status(404).json({ error: 'no body' });
    }
  } catch (e: any) {
    console.log('[s3-proxy] S3 ERROR:', e.name, e.message, 'httpStatus:', e.$metadata?.httpStatusCode);
    res.status(e.$metadata?.httpStatusCode || 500).json({ error: e.message, name: e.name });
  }
}
