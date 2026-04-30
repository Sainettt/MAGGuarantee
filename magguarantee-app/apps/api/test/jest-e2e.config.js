/** @type {import('jest').Config} */
process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testTimeout: 30_000,
};
