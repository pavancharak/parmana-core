/**
 * TEST DATA ONLY. Never used by a deployment.
 *
 * Starts the API server for tests that run it as a subprocess (the Python
 * live-server tests). The approval records are seeded first, in this same
 * process, so the server's approval repository holds them when the first
 * request arrives. Starting the server without this file leaves every
 * policy without an approval record, and the execution verifier refuses
 * every execution (D19).
 *
 * The import of the server happens after seeding, so the server module
 * loads into a process whose approval repository is already populated.
 */
import { seedPolicyGovernanceApprovals } from "./policy-governance.js";

await seedPolicyGovernanceApprovals();

await import("../packages/api/src/server.js");
