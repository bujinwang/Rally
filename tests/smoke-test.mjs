#!/usr/bin/env node
/**
 * BadmintonGroup — API Smoke Test
 *
 * Verifies the core API surface is healthy by running through the
 * full MVP flow: health → create session → join → fetch → leaderboard.
 *
 * Usage:
 *   node tests/smoke-test.mjs                          # default http://localhost:3001
 *   node tests/smoke-test.mjs https://api.example.com   # custom base URL
 *   npm run test:smoke                                  # via backend package.json
 *
 * Requires: Node.js 18+ (built-in fetch)
 */

const BASE = (process.argv[2] || 'http://localhost:3001').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

// ── Helpers ─────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

const ok = (label) => { passed++; console.log(`  ✅ ${label}`); };
const fail = (label, detail) => {
  failed++;
  console.error(`  ❌ ${label}`);
  if (detail) console.error(`     ${String(detail).split('\n').join('\n     ')}`);
};

const api = async (method, path, body) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

// ── Tests ───────────────────────────────────────────────────────
const run = async () => {
  const start = Date.now();

  console.log(`\n🏸 BadmintonGroup Smoke Test`);
  console.log(`   Target: ${BASE}\n`);

  // ── 1. Health check ──────────────────────────────────────────
  console.log('1. Health check');
  {
    const { status, json } = await api('GET', '/health');
    if (status === 200 && json?.status === 'healthy') ok('GET /health → 200 healthy');
    else fail('GET /health', `status=${status} body=${JSON.stringify(json)}`);
  }

  {
    const { status, json } = await api('GET', '/api/v1/health');
    if (status === 200 && json?.success) ok('GET /api/v1/health → 200');
    else fail('GET /api/v1/health', `status=${status}`);
  }

  // ── 2. Create session ────────────────────────────────────────
  console.log('\n2. Session creation');
  let shareCode, organizerName = 'SmokeTest';

  {
    const body = {
      organizerName,
      name: 'Smoke Test Session',
      dateTime: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      location: 'Smoke Court',
      maxPlayers: 8,
    };
    const { status, json } = await api('POST', '/mvp-sessions', body);

    if (status === 200 && json?.success) {
      shareCode = json.data?.session?.shareCode;
      ok(`POST /mvp-sessions → shareCode=${shareCode}`);
    } else {
      fail('POST /mvp-sessions', `status=${status} ${JSON.stringify(json?.error)}`);
    }
  }

  if (!shareCode) {
    console.error('\n❌ Cannot continue — session creation failed.\n');
    process.exit(1);
  }

  // ── 3. Get session by shareCode ──────────────────────────────
  console.log('\n3. Fetch session');
  {
    const { status, json } = await api('GET', `/mvp-sessions/${shareCode}`);
    if (status === 200 && json?.data?.session?.shareCode === shareCode) {
      ok(`GET /mvp-sessions/${shareCode} → match`);
    } else {
      fail(`GET /mvp-sessions/${shareCode}`, `status=${status}`);
    }
  }

  // ── 4. Join session ──────────────────────────────────────────
  console.log('\n4. Join session');
  let playerId;
  const testDeviceId = `smoke-${Date.now()}`;

  {
    const body = {
      playerName: 'Smoke Player',
      deviceId: testDeviceId,
    };
    const { status, json } = await api('POST', `/mvp-sessions/join/${shareCode}`, body);

    if (status === 200 && json?.success) {
      ok(`POST /mvp-sessions/join/${shareCode} → joined`);
      // Try to extract player ID for later use
      playerId = json.data?.player?.id;
    } else if (status === 400 && json?.error?.code === 'ALREADY_JOINED') {
      ok(`POST /mvp-sessions/join/${shareCode} → already joined (expected for owner)`);
    } else if (status === 405 || json?.error?.code === 'ALREADY_JOINED') {
      // Some responses use 405 for "already in session"
      ok(`POST /mvp-sessions/join/${shareCode} → already in session`);
    } else {
      fail('POST /mvp-sessions/join', `status=${status} ${JSON.stringify(json?.error)}`);
    }
  }

  // ── 5. Join second player ────────────────────────────────────
  console.log('\n5. Join second player');
  const device2 = `smoke-2-${Date.now()}`;

  {
    const body = {
      playerName: 'Smoke Player 2',
      deviceId: device2,
    };
    const { status, json } = await api('POST', `/mvp-sessions/join/${shareCode}`, body);

    if (status === 200 && json?.success) {
      ok(`POST /mvp-sessions/join/${shareCode} → player 2 joined`);
    } else if (json?.error?.code === 'ALREADY_JOINED') {
      ok(`POST /mvp-sessions/join/${shareCode} → player 2 already joined`);
    } else {
      fail('POST /mvp-sessions/join (player 2)', `status=${status} ${JSON.stringify(json?.error)}`);
    }
  }

  // ── 6. Refresh session state ─────────────────────────────────
  console.log('\n6. Verify session state');
  {
    const { status, json } = await api('GET', `/mvp-sessions/${shareCode}`);
    if (status === 200) {
      const playerCount = json?.data?.session?.playerCount ?? json?.data?.session?.players?.length ?? 0;
      if (playerCount >= 1) {
        ok(`GET /mvp-sessions/${shareCode} → ${playerCount} player(s)`);
      } else {
        fail(`GET /mvp-sessions/${shareCode}`, `expected >=1 players, got ${playerCount}`);
      }
    } else {
      fail(`GET /mvp-sessions/${shareCode}`, `status=${status}`);
    }
  }

  // ── 7. Leaderboard ───────────────────────────────────────────
  console.log('\n7. Leaderboard');
  {
    const { status, json } = await api('GET', `/scoring/${shareCode}/leaderboard`);
    if (status === 200) {
      ok(`GET /scoring/${shareCode}/leaderboard → ${json?.data?.leaderboard?.length ?? 0} entries`);
    } else {
      fail('GET leaderboard', `status=${status} ${JSON.stringify(json?.error)}`);
    }
  }

  // ── 8. Session discovery ─────────────────────────────────────
  console.log('\n8. Session discovery');
  {
    const { status, json } = await api('GET', '/mvp-sessions');
    if (status === 200 && Array.isArray(json?.data?.sessions)) {
      const count = json.data.sessions.length;
      ok(`GET /mvp-sessions → ${count} session(s)`);
    } else {
      fail('GET /mvp-sessions', `status=${status}`);
    }
  }

  // ── 9. My sessions by device ─────────────────────────────────
  console.log('\n9. My sessions');
  {
    const { status, json } = await api('GET', `/mvp-sessions/my/${testDeviceId}`);
    if (status === 200 && Array.isArray(json?.data?.sessions)) {
      ok(`GET /mvp-sessions/my/${testDeviceId} → ${json.data.sessions.length} session(s)`);
    } else {
      fail(`GET /mvp-sessions/my/${testDeviceId}`, `status=${status} ${JSON.stringify(json?.error)}`);
    }
  }

  // ── 10. Cleanup: leave session ───────────────────────────────
  console.log('\n10. Cleanup');
  {
    // Try to leave with the test device
    const { status, json } = await api('POST', `/mvp-sessions/${shareCode}/leave`, {
      deviceId: device2,
      playerName: 'Smoke Player 2',
    });

    if (status === 200 && json?.success) {
      ok(`POST /mvp-sessions/${shareCode}/leave → player 2 left`);
    } else {
      // Leave may not work without proper auth; not a critical failure
      console.log(`  ⚠️  Leave attempted: status=${status} (non-critical)`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed in ${elapsed}s`);
  console.log(`Target:  ${BASE}`);

  if (failed > 0) {
    console.log(`\n❌ SMOKE TEST FAILED — ${failed} check(s) did not pass.\n`);
    process.exit(1);
  }

  console.log(`\n✅ All smoke tests passed.\n`);
  process.exit(0);
};

run().catch((err) => {
  console.error(`\n❌ Smoke test crashed: ${err.message}`);
  process.exit(1);
});
