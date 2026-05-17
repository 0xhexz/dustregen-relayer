/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts', '**/*.spec.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@dustregen/contract$': '<rootDir>/../contract/src/index.ts',
    '^@midnight-ntwrk/(.*)$': '<rootDir>/src/__mocks__/@midnight-ntwrk/$1.ts',
    '^@aws-sdk/client-kms$': '<rootDir>/src/__mocks__/@aws-sdk/client-kms.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        diagnostics: { ignoreCodes: [151001] },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@midnight-ntwrk)/)'],
};
