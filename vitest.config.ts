import { defineConfig } from 'vitest/config';

// The domain modules import each other with explicit `.js` specifiers (they are authored for a
// browser ESM bundler), so the test runner has to map `./x.js` back onto `./x.ts`.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  test: {
    include: ['test/**/*.test.ts'],
    // The solver sweep and the OpenSCAD renders are far slower than a unit test.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // Each suite is a separate worker, so the slow files run alongside the fast ones.
    pool: 'forks'
  }
});
