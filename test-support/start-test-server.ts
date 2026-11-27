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
 * The policies' trusted signal source is the in-process one from
 * trusted-test-source.ts, passed to startServer. Nothing leaves this process:
 * the server does not need a public business system to run the tests.
 */
import { seedPolicyGovernanceApprovals } from "./policy-governance.js";
import { trustedTestSources } from "./trusted-test-source.js";

await seedPolicyGovernanceApprovals();

const { startServer } = await import("../packages/api/src/startServer.js");
await startServer({ businessSignalSources: trustedTestSources() });
