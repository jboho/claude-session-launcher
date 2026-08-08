// StrykerJS mutation testing for the pure TypeScript core.
// Runs the vitest suite once per mutant; a mutant that survives means no test
// distinguishes the mutated behavior from the original — i.e. a coverage gap.
//
//   command pnpm exec stryker run
//
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  // Explicit: Stryker's default `@stryker-mutator/*` glob misses pnpm's
  // symlinked node_modules layout, so the vitest runner never loads.
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["html", "clear-text", "progress"],
  // The security-critical, framework-free logic. The renderer/main edges are
  // thin wrappers verified by build + manual GUI, not unit tests, so mutating
  // them would only produce noise.
  mutate: ["src/core/**/*.ts", "!src/core/**/*.test.ts"],
  coverageAnalysis: "perTest",
  concurrency: 4,
  htmlReporter: { fileName: "reports/mutation/core.html" },
  clearTextReporter: { allowColor: true, maxTestsToLog: 3 },
  // Fail CI if the core's kill rate regresses. Tuned after the first run.
  thresholds: { high: 90, low: 80, break: null },
};
