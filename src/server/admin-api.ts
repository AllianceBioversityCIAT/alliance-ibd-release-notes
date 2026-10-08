import express, { NextFunction, Request, Response, Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  createToken,
  deleteTokenRecord,
  hashToken,
  listTokenRecords,
  setTokenActive,
} from './token-store';

// Only the SHA-256 of the admin token lives in the environment (ADMIN_TOKEN_HASH).
const HASH_RE = /^[0-9a-f]{64}$/;

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env['ADMIN_TOKEN_HASH'] ?? '';
  if (!HASH_RE.test(expected)) {
    res.status(503).json({ error: 'admin_disabled' });
    return;
  }
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
  const given = match ? Buffer.from(hashToken(match[1]), 'hex') : Buffer.alloc(32);
  if (!match || !timingSafeEqual(given, Buffer.from(expected, 'hex'))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Token CRUD for the owner (used from Claude Code with curl, no UI). */
export function adminRouter(): Router {
  const router = Router();
  router.use(requireAdmin, express.json({ limit: '4kb' }));

  router.get(
    '/tokens',
    wrap(async (_req, res) => {
      res.json({ tokens: await listTokenRecords() });
    }),
  );

  // One active token per owner: a retried create returns 409 instead of a second token.
  router.post(
    '/tokens',
    wrap(async (req, res) => {
      const owner = typeof req.body?.owner === 'string' ? req.body.owner.trim() : '';
      if (!owner || owner.length > 200) {
        res.status(400).json({ error: 'owner_required' });
        return;
      }
      const existing = (await listTokenRecords()).find((t) => t.active && t.owner === owner);
      if (existing) {
        res.status(409).json({ error: 'owner_has_active_token', tokenHash: existing.tokenHash });
        return;
      }
      const { token, record } = await createToken(owner);
      res.status(201).json({ token, ...record });
    }),
  );

  router.patch(
    '/tokens/:hash',
    wrap(async (req, res) => {
      const hash = String(req.params['hash']);
      if (!HASH_RE.test(hash) || typeof req.body?.active !== 'boolean') {
        res.status(400).json({ error: 'hash_and_active_required' });
        return;
      }
      const record = await setTokenActive(hash, req.body.active);
      if (record) res.json(record);
      else res.status(404).json({ error: 'not_found' });
    }),
  );

  router.delete(
    '/tokens/:hash',
    wrap(async (req, res) => {
      const hash = String(req.params['hash']);
      if (!HASH_RE.test(hash)) {
        res.status(400).json({ error: 'invalid_hash' });
        return;
      }
      if (await deleteTokenRecord(hash)) res.status(204).end();
      else res.status(404).json({ error: 'not_found' });
    }),
  );

  router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Admin API failed', error);
    res.status(500).json({ error: error.name });
  });

  return router;
}
