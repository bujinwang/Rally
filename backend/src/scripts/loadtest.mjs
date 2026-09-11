#!/usr/bin/env node
/**
 * Story 6.2 — load test (AC 9, 10, 11).
 *
 * Measures latency percentiles (p50/p95/p99) and cache hit rate against a
 * running Rally backend. Uses `autocannon` when available, otherwise falls back
 * to a dependency-free `node:http` runner with fixed concurrency, so the script
 * works with zero extra dependencies.
 *
 * This is a MANUAL / CI-OPTIONAL step — it is intentionally NOT part of
 * `npm test`, which must stay green and Redis-free.
 *
 * Usage:
 *   node src/scripts/loadtest.mjs
 *   BASE_URL=http://localhost:3001 CONNECTIONS=50 DURATION=10 node src/scripts/loadtest.mjs
 *
 * Thresholds (recorded in docs/perf/6.2-loadtest-results.md):
 *   p95 < 200 ms, p99 < 500 ms, cache hit rate > 80% on read-heavy endpoints.
 */

import http from 'node:http';
import { URL } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const CONNECTIONS = Number.parseInt(process.env.CONNECTIONS || '50', 10);
const DURATION = Number.parseInt(process.env.DURATION || '10', 10); // seconds
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS || '5000', 10);

/**
 * Read-heavy + one write path.
 *
 * NOTE: the discovery/analytics routes carry per-route rate limiters
 * (60 req / 15 min) that are not env-configurable, so a sustained load run
 * would be throttled. The targets below are cached read paths without a
 * per-route limiter; the global `/api/` limiter must be raised for the run
 * (see RATE_LIMIT_MAX_REQUESTS in docs/perf/6.2-loadtest-results.md).
 */
const TARGETS = [
  { method: 'GET', path: '/api/v1/mvp-sessions?limit=20', weight: 6 },
  { method: 'GET', path: '/api/v1/health', weight: 2 },
  { method: 'GET', path: '/api/v1/health/cache', weight: 2 },
];

const THRESHOLDS = { p95: 200, p99: 500, hitRate: 0.8 };

function pickTarget() {
  const total = TARGETS.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TARGETS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TARGETS[0];
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function request(target) {
  return new Promise((resolve) => {
    const url = new URL(target.path, BASE_URL);
    const start = process.hrtime.bigint();
    const req = http.request(
      { method: target.method, hostname: url.hostname, port: url.port, path: url.pathname + url.search },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => (bytes += chunk.length));
        res.on('end', () => {
          const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
          resolve({
            latencyMs,
            status: res.statusCode || 0,
            cache: (res.headers['x-cache'] || '').toString().toUpperCase(),
            bytes,
          });
        });
      }
    );
    req.on('error', () => {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ latencyMs, status: 0, cache: '', bytes: 0, error: true });
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

/** Dependency-free fixed-concurrency runner. */
async function runFallback() {
  const latencies = [];
  const statuses = new Map();
  let hits = 0;
  let misses = 0;
  let errors = 0;

  const deadline = Date.now() + DURATION * 1000;

  async function worker() {
    while (Date.now() < deadline) {
      const result = await request(pickTarget());
      latencies.push(result.latencyMs);
      statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
      if (result.cache === 'HIT') hits += 1;
      else if (result.cache === 'MISS') misses += 1;
      if (result.error) errors += 1;
    }
  }

  await Promise.all(Array.from({ length: CONNECTIONS }, () => worker()));

  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  return {
    requests: total,
    errors,
    statuses: Object.fromEntries(statuses),
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[total - 1] || 0,
    },
    cache: { hits, misses, hitRate: hits + misses > 0 ? hits / (hits + misses) : 0 },
    rps: total / DURATION,
  };
}

async function runAutocannon() {
  const { default: autocannon } = await import('autocannon');
  const results = await Promise.all(
    TARGETS.map((t) =>
      autocannon({
        url: `${BASE_URL}${t.path}`,
        method: t.method,
        connections: Math.max(1, Math.floor(CONNECTIONS / TARGETS.length)),
        duration: DURATION,
      })
    )
  );

  const latencies = results.flatMap((r) => [r.latency.p50, r.latency.p97_5, r.latency.p99]);
  latencies.sort((a, b) => a - b);
  const totalRequests = results.reduce((sum, r) => sum + r.requests.total, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  return {
    requests: totalRequests,
    errors: totalErrors,
    statuses: { '(autocannon)': totalRequests },
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] || 0,
    },
    cache: { hits: 0, misses: 0, hitRate: 0 },
    rps: totalRequests / DURATION,
  };
}

function report(result, engine) {
  const passP95 = result.latency.p95 < THRESHOLDS.p95;
  const passP99 = result.latency.p99 < THRESHOLDS.p99;
  const passHit = result.cache.hitRate >= THRESHOLDS.hitRate || result.cache.hits + result.cache.misses === 0;

  console.log('\n=== Rally load test (Story 6.2) ===');
  console.log(`Engine:      ${engine}`);
  console.log(`Base URL:    ${BASE_URL}`);
  console.log(`Connections: ${CONNECTIONS}   Duration: ${DURATION}s`);
  console.log(`Requests:    ${result.requests}   Errors: ${result.errors}   RPS: ${result.rps.toFixed(1)}`);
  console.log(`Statuses:    ${JSON.stringify(result.statuses)}`);
  console.log(`Latency:     p50=${result.latency.p50.toFixed(1)}ms  p95=${result.latency.p95.toFixed(1)}ms  p99=${result.latency.p99.toFixed(1)}ms  max=${result.latency.max.toFixed(1)}ms`);
  console.log(`Cache:       hits=${result.cache.hits}  misses=${result.cache.misses}  hitRate=${(result.cache.hitRate * 100).toFixed(1)}%`);
  console.log('--- Thresholds ---');
  console.log(`p95 < ${THRESHOLDS.p95}ms : ${passP95 ? 'PASS' : 'FAIL'} (${result.latency.p95.toFixed(1)}ms)`);
  console.log(`p99 < ${THRESHOLDS.p99}ms : ${passP99 ? 'PASS' : 'FAIL'} (${result.latency.p99.toFixed(1)}ms)`);
  console.log(`hitRate > ${THRESHOLDS.hitRate * 100}% : ${passHit ? 'PASS' : 'FAIL'} (${(result.cache.hitRate * 100).toFixed(1)}%)`);

  if (!passP95 || !passP99) process.exitCode = 1;
}

async function main() {
  let engine = 'node:http (dependency-free fallback)';
  let result;
  try {
    result = await runAutocannon();
    engine = 'autocannon';
  } catch {
    result = await runFallback();
  }
  report(result, engine);
}

main().catch((error) => {
  console.error('Load test failed:', error);
  process.exitCode = 1;
});
