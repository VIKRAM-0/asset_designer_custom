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
  const parts = req.query.path;
  if (!parts) return res.status(400).end();

  const key = 'fabric_assets/' + (Array.isArray(parts) ? parts.join('/') : parts);

  try {
    const { Body, ContentType, ContentLength } = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })
    );

    res.setHeader('Content-Type', ContentType || 'application/octet-stream');
    if (ContentLength) res.setHeader('Content-Length', String(ContentLength));
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (Body instanceof Readable) {
      Body.pipe(res);
    } else if (Body) {
      const reader = (Body as any).getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
        await pump();
      };
      await pump();
    } else {
      res.status(404).end();
    }
  } catch (e: any) {
    res.status(e.$metadata?.httpStatusCode || 500).end();
  }
}
