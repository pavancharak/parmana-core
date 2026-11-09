import { join } from "node:path";

import dotenv from "dotenv";

/**
 * Loads the test settings for a run: `.env.test` under `repoRoot`, and nothing else.
 *
 * `.env` holds the production settings. It is never read here, so a production value in `.env` cannot reach a test
 * (docs/internal/designs/TEST-DATABASE-CONFIG.md, decision D2). Values already set in the shell win, because
 * override is false.
 */
export function loadTestEnvironment(repoRoot: string): void {
  dotenv.config({
    path: join(repoRoot, ".env.test"),
    override: false,
  });
}
