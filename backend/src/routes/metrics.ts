/**
 * Metrics exposition endpoint (Story 6.3, AC 1 / AC 11).
 *
 * Serves Prometheus text format at `GET /metrics`. Access-controlled via a
 * bearer token (`Authorization: Bearer <METRICS_AUTH_TOKEN>`). Returns 401
 * if the token is missing or invalid.
 */

import { Router, Request, Response } from 'express';
import { register } from '../services/metricsRegistry';
import { env } from '../config/env';

const router = Router();

function extractBearer(req: Request): string | undefined {
  const auth = req.get('authorization');
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

router.get('/', async (req: Request, res: Response) => {
  if (!env.metrics.enabled) {
    return res.status(404).json({ error: 'Metrics disabled' });
  }

  // If no auth token is configured, the endpoint is inaccessible (safe default)
  if (!env.metrics.authToken) {
    return res.status(401).json({ error: 'Metrics auth not configured' });
  }

  const token = extractBearer(req);
  if (!token || token !== env.metrics.authToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const metrics = await register.metrics();
    res.setHeader('Content-Type', register.contentType);
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
