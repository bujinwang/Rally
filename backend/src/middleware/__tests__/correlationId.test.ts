/**
 * Correlation ID middleware tests (Story 6.3, AC 6).
 */

import { Request, Response } from 'express';
import { correlationIdMiddleware, CorrelationRequest } from '../correlationId';

function mockRes(): Response {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    getHeaders: () => headers,
  } as unknown as Response;
}

function mockNext(): jest.Mock {
  return jest.fn();
}

describe('correlationIdMiddleware', () => {
  it('propagates existing x-request-id header', () => {
    const req = { get: () => 'existing-id' } as unknown as CorrelationRequest;
    const res = mockRes();
    const next = mockNext();

    correlationIdMiddleware(req, res, next);

    expect(req.correlationId).toBe('existing-id');
    expect(res.getHeaders()['x-request-id']).toBe('existing-id');
    expect(next).toHaveBeenCalled();
  });

  it('generates a new UUID when header is absent', () => {
    const req = { get: () => undefined } as unknown as CorrelationRequest;
    const res = mockRes();
    const next = mockNext();

    correlationIdMiddleware(req, res, next);

    expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(res.getHeaders()['x-request-id']).toBe(req.correlationId);
    expect(next).toHaveBeenCalled();
  });
});
