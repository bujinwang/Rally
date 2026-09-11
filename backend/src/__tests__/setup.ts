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
// The block is partitioned per Jest worker (40000-44000 / 300 = up to 13 workers)
// so parallel runs (`--maxWorkers=N`) cannot collide with each other either; each
// worker only ever binds inside its own sub-block.
const workerId = Math.max(1, Number(process.env.JEST_WORKER_ID ?? '1') || 1);
const BLOCK_SIZE = 300;
const TEST_PORT_BLOCK_START = 40000 + (workerId - 1) * BLOCK_SIZE;
const TEST_PORT_BLOCK_END = TEST_PORT_BLOCK_START + BLOCK_SIZE;
let nextTestPort = TEST_PORT_BLOCK_START;

const originalListen = net.Server.prototype.listen;
(net.Server.prototype as any).listen = function patchedListen(this: net.Server, ...args: any[]) {
  if (typeof args[0] === 'number' && args[0] === 0) {
    args[0] = nextTestPort;
    nextTestPort += 1;
    if (nextTestPort >= TEST_PORT_BLOCK_END) nextTestPort = TEST_PORT_BLOCK_START;
  }
  return (originalListen as any).apply(this, args);
};

// Mock console methods to reduce noise during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
