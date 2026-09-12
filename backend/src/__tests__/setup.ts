// Jest setup file for database tests
import { PrismaClient } from '@prisma/client';
import * as net from 'net';

// Global test setup
// beforeAll(async () => {
//   // Any global setup can go here
// });
//
// afterAll(async () => {
//   // Clean up after all tests
// });

// ── Test-only loopback port guard ───────────────────────────────────────────
// supertest starts a brand-new HTTP server on an OS-assigned ephemeral port for
// every request (`app.listen(0)`). On developer machines the WorkBuddy/CodeBuddy
// desktop app binds its own dynamic loopback services inside the OS ephemeral
// range (49152-65535 on macOS). A test server can then land on a port that the
// desktop app also serves, and the request is answered by that app's gateway
// instead of the Express app — yielding foreign responses such as
// `401 {"error":{"code":"AUTH_REQUIRED"}}` (header `x-cell-trace-id`) or
// `404 {"error":"not_found"}`, which makes unrelated suites flake.
//
// Binding test servers from a dedicated block *below* the ephemeral range keeps
// the two allocators disjoint, so a test request can only ever reach its own
// server. Test-infrastructure only: production code and limits are untouched.
//
// Concurrency safety (two layers):
//  1. The starting slot is derived from `process.pid`, NOT `JEST_WORKER_ID`.
//     `JEST_WORKER_ID` resets per jest *process*, so two concurrent jest runs
//     (e.g. a stray background run) used to compute identical blocks and collide
//     on the same ports (`EADDRINUSE` in random route suites). A pid is unique
//     per live process, so concurrent runs start in different slots.
//  2. Each acquisition *probes forward* on `EADDRINUSE` until it finds a free
//     slot. Since a collision can still occur if two pids land in the same slot,
//     this makes the guard correct even in that residual case rather than flaky.
//
// Range 40000-49151 is safely below the macOS ephemeral floor (49152).
const PORT_START = 40000;
const PORT_END = 49151;
const SLOT_SIZE = 250;
const SLOT_COUNT = Math.floor((PORT_END - PORT_START + 1) / SLOT_SIZE);
let cursorSlot = process.pid % SLOT_COUNT;

const originalListen = net.Server.prototype.listen;

/**
 * Patched `listen`: rewrites a `listen(0)` (OS-assigned ephemeral) request into a
 * port from the dedicated test range, probing forward on `EADDRINUSE`.
 *
 * Event-model note (important): Node coalesces queued `EADDRINUSE` emissions and
 * invokes *every* attached listener when it flushes. Attaching one `once`
 * listener per attempt therefore loses errors — a single flush consumes all the
 * per-attempt handlers at once and later failures escape as uncaught. Instead a
 * single **persistent** handler is attached for the duration of the probe and
 * removed on success, so every queued `EADDRINUSE` is absorbed exactly once and
 * non-`EADDRINUSE` errors are re-thrown rather than swallowed.
 */
(net.Server.prototype as any).listen = function patchedListen(
  this: net.Server,
  ...args: any[]
) {
  if (!(typeof args[0] === 'number' && args[0] === 0)) {
    return originalListen.apply(this, args as any);
  }

  const absorbProbeError = (err: any): void => {
    if (!err || err.code !== 'EADDRINUSE') throw err;
  };

  for (let attempt = 0; attempt < SLOT_COUNT; attempt += 1) {
    const slot = (cursorSlot + attempt) % SLOT_COUNT;
    const port = PORT_START + slot * SLOT_SIZE;
    this.on('error', absorbProbeError);
    try {
      originalListen.call(this, port);
    } catch (err) {
      // Synchronous throw (rare). `EADDRINUSE` is retried; anything else is real.
      if ((err as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') {
        this.removeListener('error', absorbProbeError);
        throw err;
      }
      this.removeListener('error', absorbProbeError);
      continue;
    }
    if (this.address()) {
      // Bound successfully: park the cursor after this slot for the next bind
      // and drop the probe handler so later real errors surface normally.
      cursorSlot = (slot + 1) % SLOT_COUNT;
      this.removeListener('error', absorbProbeError);
      return this;
    }
    // Bind failed asynchronously: `address()` is null and an `EADDRINUSE` event is
    // pending. Keep the handler attached (it absorbs every queued emission) and
    // probe the next slot.
  }

  // Every slot busy (implausible: that would need ~36 concurrent jest processes).
  // Fall back to an OS-assigned port rather than hard-failing the whole run.
  this.removeListener('error', absorbProbeError);
  return originalListen.apply(this, args as any);
};

// Mock console methods to reduce noise during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
