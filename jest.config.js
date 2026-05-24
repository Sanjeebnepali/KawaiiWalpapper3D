/**
 * Jest config for unit tests.
 *
 * Uses the `jest-expo` preset so TS/JSX is transformed with `babel-preset-expo`
 * and the RN/Expo module graph + mocks are in place — the same transform the
 * app bundle uses. Tests live in `__tests__` folders next to the code.
 *
 * Current scope: pure-logic unit tests (lib/, store/, extracted helpers). These
 * are fast, need no device, and lock in the behaviour the file-size refactor
 * preserved. Component/render tests can be added later with
 * @testing-library/react-native.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],
};
