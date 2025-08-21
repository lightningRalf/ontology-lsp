module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/vscode-client/'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(leven|uuid|js-yaml)/)'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  }
};