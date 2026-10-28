import { execSync } from "node:child_process";

/**
 * Runs the dist freshness check before every vitest run, not only through
 * `npm test`. Cross-package tests import workspace packages through dist/,
 * so a stale build runs old code and can pass when the source would fail.
 * The check exits non-zero on stale output, which fails the run here.
 */
export default function setup(): void {
  execSync("npx --no-install tsx scripts/check-dist-fresh.ts", {
    stdio: "inherit",
  });
}
