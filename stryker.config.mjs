// Mutation testing for one package at a time: npm run mutation -- <package>
// (scripts/mutation.ts sets STRYKER_PACKAGE).
//
// Stryker changes one thing in the package's source at a time (a mutant)
// and runs that package's own tests, which import its src directly. A
// mutant the tests catch is "killed"; one they miss "survived".
//
// The command runner is used, not @stryker-mutator/vitest-runner: under
// Vitest 5 that plugin never switches a mutant on, so every mutant
// "survives". The command runner switches it on through the
// __STRYKER_ACTIVE_MUTANT__ environment variable, which works.
const pkg = process.env.STRYKER_PACKAGE;
if (!pkg) throw new Error("Run through `npm run mutation -- <package>`.");

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: { command: `npx vitest run packages/${pkg} --reporter=dot` },
  mutate: [`packages/${pkg}/src/**/*.ts`, `!packages/${pkg}/src/**/index.ts`],
  coverageAnalysis: "off",
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: { fileName: `reports/mutation/${pkg}.json` },
  htmlReporter: { fileName: `reports/mutation/${pkg}.html` },
  ignorePatterns: [
    "docs/site/*.pdf",
    "docs/site/llms-full.txt",
    "reports",
    "**/.venv",
  ],
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 60000,
};
