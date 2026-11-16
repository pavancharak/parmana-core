/**
 * Database gate for @parmana/api's integration suites. The implementation is shared
 * with packages/storage (test-support/database-gate.ts); see that file for the
 * PARMANA_REQUIRE_DATABASE rule that makes CI fail instead of skipping.
 */
export {
  databaseRequired,
  hasDatabaseUrlConfig,
  resolveDatabaseGate,
} from "../../../../test-support/database-gate.js";
