import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The server starts the policy version 2 sweeps and stops them on shutdown. startServer.ts runs the
 * whole server when it is called, so the test suite does not call it. This checks the wiring in its
 * source: the timer is started through startPolicyV2Sweeps, and the shutdown hook clears it.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const server = readFileSync(
  join(repoRoot, "packages/api/src/startServer.ts"),
  "utf8",
);

describe("the server's policy version 2 sweep wiring", () => {
  it("starts the sweep timer from the runtime, through startPolicyV2Sweeps", () => {
    expect(server).toMatch(
      /const\s+policyV2SweepTimer\s*=\s*startPolicyV2Sweeps\(\s*policyV2\s*\)\s*;/,
    );
  });

  it("clears that timer in the graceful shutdown hook", () => {
    const shutdown = server.match(/createGracefulShutdown\(\{[\s\S]*?\}\);/);
    expect(shutdown).not.toBeNull();
    expect(shutdown![0]).toMatch(
      /onShutdown:\s*\(\)\s*=>\s*\{[\s\S]*clearInterval\(\s*policyV2SweepTimer\s*\)/,
    );
  });
});
