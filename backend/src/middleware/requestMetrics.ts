/**
 * Request instrumentation middleware (Story 6.3, AC 2 / AC 13).
 *
 * Captures ALL response paths by monkey-patching `res.end` (the terminal
 * method). This ensures raw `res.end()`, `res.sendFile()`, `res.redirect()`,
 * and the standard `res.json()`/`res.send()` are all recorded exactly once.
 *
 * Records:
 *  - `rally_http_requests_total` counter (method, route, status)
 *  - `rally_http_request_duration_seconds` histogram (method, route)
 *
 * Uses `process.hrtime.bigint()` for sub-millisecond precision with
 * negligible overhead.
 */

import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDuration,
  canonicalRoute,
} from '../services/metricsRegistry';
import { CorrelationRequest } from './correlationId';

export const requestMetricsMiddleware = (
  req: CorrelationRequest,
  res: Response,
  next: NextFunction
): void => {
  const start = process.hrtime.bigint();
  const route = canonicalRoute(req);

  const originalEnd = res.end;

  res.end = function endOverride(
    this: Response,
    chunk?: any,
    encoding?: any
  ): Response {
    // Restore immediately so nested calls behave normally
    res.end = originalEnd;

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = String(res.statusCode);
    const method = req.method;

    // Update Prometheus metrics (fire-and-forget; never block the response)
    try {
      httpRequestsTotal.inc({ method, route, status });
      httpRequestDuration.observe({ method, route }, durationMs / 1000);
    } catch {
      /* best-effort — metric errors must not break the request */
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};
