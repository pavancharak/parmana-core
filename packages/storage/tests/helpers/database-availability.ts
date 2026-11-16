/**
 * Database gate for @parmana/storage's integration suites. The implementation is shared
 * with packages/api (test-support/database-gate.ts); see that file for the
 * PARMANA_REQUIRE_DATABASE rule that makes CI fail instead of skipping.
 */
export {
  databaseRequired,
  hasDatabaseUrlConfig,
  resolveDatabaseGate,
} from "../../../../test-support/database-gate.js";
