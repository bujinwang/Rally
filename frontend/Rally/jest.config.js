module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // `/node_modules/` is jest's default — kept here because specifying this
  // option replaces the default rather than appending to it.
  //
  // Spec-object modules (plain data, no it()/test() calls) — they document
  // intent for discoveryApi/statisticsApi but contain no executable tests, so
  // jest errors with "must contain at least one test". Excluded until they are
  // converted into real suites. Story 6.5 (QA finding D4).
  testPathIgnorePatterns: [
    '/node_modules/',
    'discoveryApi\\.test\\.ts$',
    'statisticsApi\\.test\\.ts$',
  ],
};
