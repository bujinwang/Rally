/**
 * Request metrics middleware tests (Story 6.3, AC 2 / AC 13).
 */

import { Request, Response } from 'express';
import { requestMetricsMiddleware } from '../requestMetrics';
import { CorrelationRequest } from '../correlationId';

function mockReq(overrides?: Partial<CorrelationRequest>): CorrelationRequest {
  return {
    method: 'GET',
    path: '/api/v1/test',
    ...overrides,
  } as unknown as CorrelationRequest;
}

function mockRes(): Response {
  let statusCode = 200;
  const res = {
    statusCode,
    status(code: number) {
      statusCode = code;
      return this;
    },
    end: jest.fn(function (this: Response) {
      return this;
    }),
    json: jest.fn(function (this: Response) {
      return this;
    }),
  } as unknown as Response;
  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (v) => { statusCode = v; },
  });
  return res;
}

describe('requestMetricsMiddleware', () => {
  it('calls next() and restores res.end', () => {
    const req = mockReq();
    const res = mockRes();
    const originalEnd = res.end;
    const next = jest.fn();

    requestMetricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.end).not.toBe(originalEnd);

    // Simulate response completion
    res.end();
    expect(res.end).toBe(originalEnd);
  });

  it('does not throw when res.end is called multiple times', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    requestMetricsMiddleware(req, res, next);

    expect(() => {
      res.end();
      res.end(); // second call should use the restored original
    }).not.toThrow();
  });
});
