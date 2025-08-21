module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^leven$': '<rootDir>/__mocks__/leven.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|js-yaml)/)'
  ]
};