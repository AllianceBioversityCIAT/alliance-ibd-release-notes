import express, { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NOTION_UPLOAD_REF, uploadBytesToNotion } from './release-notes/notion';

// Local screenshots (e.g. Playwright) reach Notion through a short-lived signed URL, so the
// client never handles the personal token. Amplify compute caps request bodies near 6 MB.
const TTL_MS = 15 * 60_000;
const MAX_BYTES = '5mb';

function signingKey(): string {
  const key = process.env['ADMIN_TOKEN_HASH'];
  if (!key) throw new Error('Image uploads are not configured');
  return key + ':image-upload';
}

const sign = (exp: string) => createHmac('sha256', signingKey()).update(exp).digest('hex');

export function signedUploadUrl(baseUrl: string): { url: string; expires: string } {
  const exp = String(Date.now() + TTL_MS);
  return { url: `${baseUrl}/api/images?exp=${exp}&sig=${sign(exp)}`, expires: new Date(Number(exp)).toISOString() };
}

export function imageUploadRouter(): Router {
  const router = Router();
  router.post('/', express.raw({ type: 'image/*', limit: MAX_BYTES }), async (req, res) => {
    const exp = String(req.query['exp'] ?? '');
    const sig = String(req.query['sig'] ?? '');
    let valid = false;
    try {
      valid =
        /^\d+$/.test(exp) &&
        Number(exp) > Date.now() &&
        /^[0-9a-f]{64}$/.test(sig) &&
        timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(sign(exp), 'hex'));
    } catch {
      valid = false;
    }
    if (!valid) {
      res.status(401).json({ error: 'invalid_or_expired_upload_url' });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'send the image bytes with Content-Type: image/png or image/jpeg' });
      return;
    }
    try {
      const body = req.body as Buffer;
      const bytes = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      const id = await uploadBytesToNotion(bytes, String(req.get('content-type')).split(';')[0]);
      res.status(201).json({ ref: NOTION_UPLOAD_REF + id, note: 'Use it as ![caption](ref) and publish within 1 hour.' });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });
  return router;
}
