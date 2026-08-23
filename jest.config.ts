import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  // Jest's default testMatch treats every file under any __tests__/ dir as
  // a test file — that would also try to run the shared fixtures/helpers
  // added under __tests__/helpers/ as their own (empty) test suites.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/helpers/'],
  moduleNameMapper: {
    // Next.js aliases 'server-only' to its own vendored no-op copy inside
    // its webpack/Turbopack config; that alias doesn't exist under plain
    // Jest, and the package itself isn't a real project dependency (Next
    // resolves it internally). Standard Next+Jest fix: stub it here.
    '^server-only$': '<rootDir>/__tests__/helpers/server-only-stub.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  testTimeout: 300000,
  collectCoverageFrom: ['lib/ocr/**/*.ts'],
};

export default config;
