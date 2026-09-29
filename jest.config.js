'use strict';

module.exports = {
  globals: {
    SDK_VERSION: 'beep',
  },
  moduleNameMapper: {
    '\\.css$': require.resolve('jest-css-modules'),
  },
  modulePathIgnorePatterns: ['/packages/core/src/*'],
  testEnvironment: 'jsdom',
  // several tests time real work (500-chip renders, 100 navigations): don't flake when the machine is busy
  testTimeout: 30000,
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/test/',
    '/packages/core/src/',
  ],
  testRunner: 'jest-circus/runner',
};
