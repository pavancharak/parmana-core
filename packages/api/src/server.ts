import "dotenv/config";

import { PolicyChangeCrypto } from "@parmana/crypto";
import { loadConfig } from "@parmana/shared";

import { assertStorageConfigured } from "./bootstrap/assertStorageConfigured.js";
import {
  assertKmsSigningKeyReachable,
  assertSigningKeyMaterialConfigured,
} from "./bootstrap/assertSigningKeyMaterialConfigured.js";
import { assertPaytmConnectorConfigured } from "./bootstrap/assertPaytmConnectorConfigured.js";
import { createGracefulShutdown } from "./bootstrap/createGracefulShutdown.js";
import { createExecutionSystem } from "./bootstrap/createExecutionSystem.js";
import { createApplication, policyRepository } from "./application.js";
import { createCallerAuthenticator } from "./bootstrap/createCallerAuthenticator.js";
import { createPolicyChangeStepUpVerifier } from "./bootstrap/createPolicyChangeStepUpVerifier.js";
import { createPolicyChangeApprovalService } from "./bootstrap/createPolicyChangeApprovalService.js";
import { assertPolicyGovernanceIntegrityAtStartup } from "./governance/verifyPolicyGovernanceIntegrityAtStartup.js";
import { policyChangeApprovalRecordRepository } from "./repositories.js";
import { schedulePolicyGovernanceIntegrityCheck } from "./bootstrap/schedulePolicyGovernanceIntegrityCheck.js";
import { createRateLimitStore } from "./bootstrap/createRateLimitStore.js";
import { createSandboxOptions } from "./bootstrap/createSandboxOptions.js";
import { createApp } from "./app.js";

/**
 * Fail-closed startup validation, before any other bootstrap runs and
 * before the port is ever bound. Everything else this module calls
 * below already fails closed once invoked (createNonceStore,
 * createCallerAuditSink, createCallerAuthenticator, ...) — these two
 * run first specifically because nothing else in this codebase
 * validates them eagerly: durable storage is normally validated
 * lazily (repositories.ts's Proxy, deliberately, so test collection on
 * a machine with no credentials doesn't construct a live Supabase
 * client — see assertStorageConfigured.ts), and signing key material
 * is normally validated lazily too (FileKeyProvider, only on the first
 * sign/verify call — see assertSigningKeyMaterialConfigured.ts).
 * assertPaytmConnectorConfigured() closes a narrower gap: not "is the
 * Paytm connector configured at all" (it's optional, like HubSpot/
 * GitHub — createConnectorRegistry.ts simply doesn't register it when
 * unset), but "is it configured consistently" — refusing to start with
 * only one of PAYTM_CONNECTOR_URL/PAYTM_CONNECTOR_SHARED_SECRET set,
 * which would otherwise surface later as a connector that "registered"
 * but can never authenticate to or reach the remote Paytm connector
 * service.
 * Without these, a misconfigured process could bind the port, pass
 * /health, and only fail on its first real request.
 */
assertStorageConfigured();
assertSigningKeyMaterialConfigured();
await assertKmsSigningKeyReachable();
assertPaytmConnectorConfigured();

// ADR-0014: PARMANA_CORS_ORIGINS and sandbox mode, refused at startup
// when unsafe (see createSandboxOptions).
const sandbox = createSandboxOptions();

const executionSystem = await createExecutionSystem();

const application = createApplication(executionSystem);

const callerAuth = createCallerAuthenticator();

const executeRateLimitStore = createRateLimitStore("execute:");

const healthRateLimitStore = createRateLimitStore("health:");

const publicRateLimitStore = createRateLimitStore("public:");
const authFailureRateLimitStore = createRateLimitStore("auth-failure:");

const app = createApp(application, {
  callerAuth: callerAuth.disabled
    ? "disabled"
    : {
        authenticator: callerAuth.authenticator,
        auditSink: callerAuth.auditSink,
      },
  rateLimit: {
    ...loadConfig().rateLimit,
    ...(executeRateLimitStore ? { executeStore: executeRateLimitStore } : {}),
    ...(healthRateLimitStore ? { healthStore: healthRateLimitStore } : {}),
    ...(publicRateLimitStore ? { publicStore: publicRateLimitStore } : {}),
    ...(authFailureRateLimitStore
      ? { authFailureStore: authFailureRateLimitStore }
      : {}),
  },
  ...(callerAuth.disabled
    ? {}
    : {
        stepUpVerifier: createPolicyChangeStepUpVerifier(),
        policyChangeApprovalService: createPolicyChangeApprovalService(),
      }),
  ...(sandbox.sandboxApprover
    ? { sandboxApprover: sandbox.sandboxApprover }
    : {}),
  corsOrigins: sandbox.corsOrigins,
});

// PaaS platforms (Railway, Render, Fly, etc.) commonly inject PORT
// dynamically at deploy time and expect the process to bind to
// whatever value they provide, not a hardcoded default — Config.ts's
// api.port already reads process.env.PORT with a 3000 fallback for
// local development, so this is the only place that needs to change to
// stop hardcoding it.
const PORT = loadConfig().api.port;
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * Policy Governance integrity check, before the port opens. A mismatch
 * between an approved policy and its live file, or a check that cannot
 * run at all, stops the server from starting. Refusing to start is the
 * only safe answer: the server would otherwise decide under a policy
 * nobody can show was approved. The periodic re-run below stays
 * fail-open, so drift found during uptime is logged.
 */
try {
  await assertPolicyGovernanceIntegrityAtStartup({
    policyRepository,
    policyChangeCrypto: new PolicyChangeCrypto(),
    policyChangeApprovalRecordRepository,
  });
} catch (error) {
  console.error({
    event: "policy_governance_integrity_startup_refused",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`API running on http://${HOST}:${PORT}`);
});

/**
 * Policy Governance integrity check, again on a fixed interval for the
 * rest of this process's uptime -- see schedulePolicyGovernanceIntegrityCheck.ts for why the
 * startup-only run above leaves a gap between deploys.
 */
schedulePolicyGovernanceIntegrityCheck();

// Graceful shutdown on SIGTERM/SIGINT — see createGracefulShutdown.ts
// for the full reasoning and what it guards against.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
const shutdown = createGracefulShutdown({
  server,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
