/**
 * jest.setup.js — global test setup for the Rally frontend.
 *
 * Story 6.5 / T01: map the official ship-with-package mocks for the two native
 * modules used by the offline-sync code so suites can run without a device:
 *   - @react-native-async-storage/async-storage
 *   - @react-native-community/netinfo
 *
 * NOTE: `@testing-library/react-native` is intentionally NOT used — it is not a
 * dependency and must not become one.
 */

/* eslint-env jest */

// AsyncStorage — official in-package mock (backed by an in-memory store).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo — official in-package mock.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// react-native-get-random-values installs a global `crypto` polyfill as a side
// effect; silence it in tests so importing it is a harmless no-op.
jest.mock('react-native-get-random-values', () => ({}));

// Provide a deterministic `crypto.randomUUID` when the runtime does not expose
// one (Node 18+ already does). Suites that specifically exercise the queue's
// fallback id strategy delete `global.crypto.randomUUID` themselves.
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => {
        counter += 1;
        return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
      },
    },
  });
}
