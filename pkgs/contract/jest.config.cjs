/**
 * Minimal Jest + ts-jest (ESM) harness for pkgs/contract.
 *
 * Scope: just enough to run the Property 1 test in src/__tests__/increment.spec.ts
 * against the generated test-call bindings. The broader monorepo harness
 * (workspace-root config, default numRuns env, CI bumps) is owned by task 8.1.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  // Resolve `./foo.js` style ESM imports (used by the generated bindings) to
  // their actual files when ts-jest compiles spec files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json',
        diagnostics: { ignoreCodes: [151001] },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@midnight-ntwrk)/)'],
};
