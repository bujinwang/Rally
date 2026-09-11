/**
 * Correlation ID middleware (Story 6.3, AC 6).
 *
 * Propagates or generates a correlation ID for every request so that logs,
 * errors, and traces can be tied together across the request lifecycle.
 *
 * Behaviour:
 *  - Reads `x-request-id` from the incoming request header (propagation).
 *  - If absent, generates a new `crypto.randomUUID()`.
 *  - Attaches it to `req.correlationId`.
 *  - Echoes it back in the response header `x-request-id`.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface CorrelationRequest extends Request {
  correlationId?: string;
}

const HEADER_NAME = 'x-request-id';

export const correlationIdMiddleware = (
  req: CorrelationRequest,
  res: Response,
  next: NextFunction
): void => {
  const id = req.get(HEADER_NAME) || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader(HEADER_NAME, id);
  next();
};
