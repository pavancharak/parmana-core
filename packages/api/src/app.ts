import express from "express";
import documentationRoutes from "./routes/documentation.js";
import referenceRoutes from "./routes/reference.js";

import { createErrorHandler } from "./middleware/error-handler.js";
import { createCallerAuthMiddleware } from "./middleware/caller-auth.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import {
  createExecuteRateLimiter,
  createAuthFailureRateLimiter,
  createHealthReadyRateLimiter,
  createPublicRateLimiter,
} from "./middleware/rate-limit.js";
import type { Store } from "express-rate-limit";

import policyRoutes from "./routes/policies.js";
import { createPendingPolicyChangesRouter } from "./routes/pending-policy-changes.js";
import { createApprovalIssuersRouter } from "./routes/approval-issuers.js";
import { createExternalConnectorsRouter } from "./routes/external-connectors.js";
import { createBusinessSignalSourcesRouter } from "./routes/business-signal-sources.js";
import { createAuthorityGrantsRouter } from "./routes/authority-grants.js";
import type { EndpointAddressLookup } from "@parmana/shared";
import type { ExecutionTrustApplication } from "@parmana/runtime";

import { createExecuteRouter } from "./routes/execute.js";
import healthRoutes from "./routes/health.js";
import openapiRoutes from "./routes/openapi.js";
import handbookPdfRoutes from "./routes/handbook-pdf.js";
import openapiJsonRoutes from "./routes/openapi-json.js";
import apiManifestRoutes from "./routes/api-manifest.js";
import { createReceiptRouter } from "./routes/receipt.js";

import { createReplayRouter } from "./routes/replay.js";
import { createReceiptGetRouter } from "./routes/receipt-get.js";
import { createTransactionsRouter } from "./routes/transactions.js";
import { createCallersMeRouter } from "./routes/callers-me.js";
import { createPolicyInEffectRouter } from "./routes/policy-in-effect.js";
import { createTrustRecordsRouter } from "./routes/trust-records.js";
import { createVerifyGetRouter } from "./routes/verify-get.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createRefusalVerifyRouter } from "./routes/refusal-verify.js";
import {
  createExecutionIntentsRouter,
  createExecutionIntentVerifyRouter,
} from "./routes/execution-intents.js";
import { createRefusalGetRouter } from "./routes/refusal-get.js";
import { createAuditVerifyRouter } from "./routes/audit-verify.js";
import { createReadyRouter } from "./routes/ready.js";
import { createKeysRouter } from "./routes/keys.js";
import { createHandbookRouter } from "./routes/handbook.js";
import {
  createSandboxApprovalsRouter,
  type SandboxApprover,
} from "./routes/sandbox-approvals.js";

import versionRoutes from "./routes/version.js";

import type { CallerAuthenticator } from "./auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "./auth/CallerAuditSink.js";
import type { PolicyChangeStepUpVerifier } from "./auth/PolicyChangeStepUpVerifier.js";
import type { PolicyChangeApprovalService } from "./governance/PolicyChangeApprovalService.js";

/**
 * Every call site must state its caller-auth choice explicitly:
 * either a real authenticator/auditSink pair, or the literal
 * string "disabled" to mount the app with no caller-auth
 * middleware at all. There is no default: silently omitting
 * this option is exactly the failure mode this type exists to
 * rule out (see docs/CLAIMS.md and the July 2026 audit closeout).
 */
export type CallerAuthOption =
  | "disabled"
  | {
      readonly authenticator: CallerAuthenticator;
      readonly auditSink: CallerAuditSink;
    };

/**
 * Optional, unlike callerAuth: every existing call site (roughly twenty
 * test files, plus server.ts) predates rate limiting, and requiring
 * this field would force every one of them to state a value it has no
 * opinion about. Omitted entirely, this deployment gets
 * DEFAULT_EXECUTE_PER_MINUTE/DEFAULT_HEALTH_PER_MINUTE below -- the same
 * numbers packages/shared/src/config/Config.ts falls back to when
 * RATE_LIMIT_EXECUTE_PER_MINUTE/RATE_LIMIT_HEALTH_PER_MINUTE are unset,
 * so server.ts's real wiring and a bare createApp(application, {
 * callerAuth }) call behave identically unless a test deliberately
 * overrides one to exercise 429 behavior.
 */
export interface RateLimitOption {
  readonly executePerMinute: number;
  readonly healthPerMinute: number;

  /**
   * Separate Store instances for the execute and health/ready limiters
   * (see createRateLimitStore.ts). Deliberately two distinct fields,
   * not one shared `store` (this field's original, single-store shape,
   * found 2026-09-15 to be a real production bug): express-rate-limit
   * v8 refuses to let the same Store instance back more than one
   * limiter (`ERR_ERL_STORE_REUSE`), throwing at limiter construction
   * time -- passing one shared instance to both createExecuteRateLimiter
   * and createHealthReadyRateLimiter crashed every request on a fresh
   * Vercel cold start. Optional: omitted, each limiter falls back to
   * express-rate-limit's own in-process MemoryStore, exactly the
   * behavior every existing call site had before this field existed.
   */
  readonly executeStore?: Store;

  readonly healthStore?: Store;

  /**
   * The unauthenticated verify routes and /handbook, keyed by IP (G-78).
   * Optional, defaulting to DEFAULT_PUBLIC_PER_MINUTE, so existing call
   * sites need no change.
   */
  readonly publicPerMinute?: number;

  readonly publicStore?: Store;

  /**
   * Failed caller authentications per IP per minute (401s only). Every
   * one writes a signed caller.rejected audit event; see
   * createAuthFailureRateLimiter. Defaults to
   * DEFAULT_AUTH_FAILURE_PER_MINUTE.
   */
  readonly authFailurePerMinute?: number;

  readonly authFailureStore?: Store;
}

const DEFAULT_EXECUTE_PER_MINUTE = 30;
const DEFAULT_HEALTH_PER_MINUTE = 300;
const DEFAULT_PUBLIC_PER_MINUTE = 60;
const DEFAULT_AUTH_FAILURE_PER_MINUTE = 30;

export interface CreateAppOptions {
  readonly callerAuth: CallerAuthOption;
  readonly rateLimit?: RateLimitOption;

  /**
   * Verifies the step-up authorization envelope required on POST
   * /policies/pending-changes/:id/approve and .../reject (Policy
   * Governance, maker-checker, Layer 4) -- see
   * PolicyChangeStepUpVerifier and requireStepUpAuthorization in
   * pending-policy-changes.ts. Optional at this type's level, the same
   * way auditSink threading elsewhere in this file is conditional on
   * callerAuth, but NOT optional in effect once callerAuth is enabled:
   * approve/reject fail closed (StepUpAuthorizationInvalidError) when
   * this is undefined, exactly as when it is provided but the
   * envelope itself is missing or invalid. Omitted in the
   * callerAuth-disabled case (local development/tutorials only) since
   * neither endpoint is reachable without a caller identity there.
   */
  readonly stepUpVerifier?: PolicyChangeStepUpVerifier;

  /**
   * Resolves an approved pending policy change into its live
   * policies/{name}/{version}/policy.json write and signed
   * PolicyChangeApprovalRecord (Policy Governance, maker-checker) --
   * see PolicyChangeApprovalService and pending-policy-changes.ts's
   * approve handler. Optional at this type's level for the same
   * reason stepUpVerifier is: omitted entirely in the
   * callerAuth-disabled case, where the endpoint is unreachable
   * anyway. NOT optional in effect once callerAuth is enabled --
   * approve fails closed (a plain thrown Error, surfaced as a 500 by
   * the global error handler) when this is undefined but an approval
   * is actually attempted, rather than silently resolving the pending
   * change with no corresponding live effect.
   */
  readonly policyChangeApprovalService?: PolicyChangeApprovalService;

  /**
   * How /external-connectors and /business-signal-sources resolve an
   * endpoint's host to check its address (ADR-0013, RFC-0023). Defaults to the system resolver; tests pass
   * their own so they need no network.
   */
  readonly externalEndpointLookup?: EndpointAddressLookup;

  /**
   * Origins allowed to call the API from a browser (ADR-0014,
   * PARMANA_CORS_ORIGINS). Omitted or empty: no CORS header is sent.
   */
  readonly corsOrigins?: readonly string[];

  /**
   * The sandbox's demo approver (ADR-0014, PARMANA_SANDBOX=true). When
   * present, POST /sandbox/approvals exists; otherwise it does not.
   * createSandboxOptions() refuses it outside sandbox mode and while any
   * built in connector is configured.
   */
  readonly sandboxApprover?: SandboxApprover;
}

export function createApp(
  application: ExecutionTrustApplication,
  options: CreateAppOptions,
) {
  const app = express();

  /**
   * Trust exactly one proxy hop: Fly.io's edge (fly.toml sets
   * force_https there), the only reverse proxy in front of this app.
   * Without this, Express ignores X-Forwarded-For and ignores
   * X-Forwarded-Proto, so req.ip and req.protocol/req.secure both
   * reflect the proxy's own connection to this process rather than the
   * original client's.
   */
  app.set("trust proxy", 1);

  if (options.corsOrigins !== undefined && options.corsOrigins.length > 0) {
    app.use(createCorsMiddleware(options.corsOrigins));
  }

  const executePerMinute =
    options.rateLimit?.executePerMinute ?? DEFAULT_EXECUTE_PER_MINUTE;
  const healthPerMinute =
    options.rateLimit?.healthPerMinute ?? DEFAULT_HEALTH_PER_MINUTE;
  const publicPerMinute =
    options.rateLimit?.publicPerMinute ?? DEFAULT_PUBLIC_PER_MINUTE;
  const authFailurePerMinute =
    options.rateLimit?.authFailurePerMinute ?? DEFAULT_AUTH_FAILURE_PER_MINUTE;

  app.use(express.json());

  /**
   * System
   *
   * /health, /ready, /openapi.yaml, /openapi.json, /api-manifest.json,
   * /documentation, and /reference are the routes exempt from caller
   * authentication: liveness/readiness
   * probes and API documentation consumers must be able to reach them
   * with no credential (a caller cannot discover how to get a key from a
   * spec it is not allowed to read, and a PaaS orchestrator has no API
   * key at all). Everything below this line, including "/" and
   * "/version", sits behind the middleware when it is provided.
   */
  const healthReadyRateLimiter = createHealthReadyRateLimiter(
    healthPerMinute,
    options.rateLimit?.healthStore,
  );

  app.use("/health", healthReadyRateLimiter, healthRoutes);
  app.use(
    "/ready",
    healthReadyRateLimiter,
    createReadyRouter({ authDisabled: options.callerAuth === "disabled" }),
  );
  app.use("/openapi.yaml", openapiRoutes);
  app.use("/parmana-handbook.pdf", handbookPdfRoutes);
  app.use("/openapi.json", openapiJsonRoutes);
  app.use("/api-manifest.json", apiManifestRoutes);
  app.use("/documentation", documentationRoutes);
  app.use("/reference", referenceRoutes);

  /**
   * RFC-0021: deliberately exempt from caller-auth, alongside the
   * system routes above -- this is the unauthenticated, third-party
   * signature-verification capability, not a data-access route. Its
   * ownership-scoped counterpart, GET /refusal/:businessTransactionId,
   * is mounted below the middleware with everything else.
   */
  const publicRateLimiter = createPublicRateLimiter(
    publicPerMinute,
    options.rateLimit?.publicStore,
  );

  app.use(
    "/refusal/verify",
    publicRateLimiter,
    createRefusalVerifyRouter(application),
  );

  /**
   * ADR-0012: the same unauthenticated, third-party signature verification
   * capability for Execution Intents. Takes the intent itself and reads no
   * storage. The data routes are mounted below the caller-auth middleware.
   */
  app.use(
    "/execution-intents/verify",
    publicRateLimiter,
    createExecutionIntentVerifyRouter(application),
  );

  /**
   * Audit-sink signing milestone: the same unauthenticated,
   * third-party-verifiable capability as POST /refusal/verify above,
   * over the durable caller_audit_events audit trail instead of Refusal
   * Records. No ExecutionTrustApplication dependency -- verification
   * here is pure signature-over-bytes, with no database lookup
   * involved.
   */
  app.use("/audit/verify", publicRateLimiter, createAuditVerifyRouter());

  /**
   * PQC audit RED-2 (docs/VERIFICATION-GAPS.md): public-key discovery,
   * the same unauthenticated-by-necessity category as
   * /refusal/verify and /audit/verify above -- a third party fetching
   * the key it needs to independently verify a signature cannot be
   * required to already hold a Parmana credential to reach it.
   * Defines its own full paths (/keys/:keyId and
   * /.well-known/jwks.json) rather than being mounted at a prefix; see
   * keys.ts's own comment for why.
   */
  app.use(["/keys", "/.well-known/jwks.json"], publicRateLimiter);
  app.use(createKeysRouter());

  /**
   * Handbook download-lead capture (docs/site/handbook/download.mdx):
   * a visitor downloading the handbook has no Parmana credential yet,
   * so this is exempt from caller-auth for the same reason every
   * other route in this block is.
   */
  app.use("/handbook", publicRateLimiter, createHandbookRouter());

  if (options.callerAuth !== "disabled") {
    app.use(
      createAuthFailureRateLimiter(
        authFailurePerMinute,
        options.rateLimit?.authFailureStore,
      ),
    );

    app.use(
      createCallerAuthMiddleware(
        options.callerAuth.authenticator,
        options.callerAuth.auditSink,
      ),
    );
  }
  app.get("/", (_req, res) => {
    res.json({
      name: "Parmana",
      status: "UP",
    });
  });

  app.use("/version", versionRoutes);

  /**
   * Caller identity/scope self-lookup ("show me this agent's identity
   * and exactly what it's authorized to do").
   */
  app.use("/callers/me", createCallersMeRouter());

  /**
   * ADR-0014: the sandbox's demo approver. Exists only in sandbox mode.
   * Behind caller authentication (the published demo key) and the
   * per address public limit.
   */
  if (options.sandboxApprover !== undefined) {
    app.use(
      "/sandbox/approvals",
      publicRateLimiter,
      createSandboxApprovalsRouter(options.sandboxApprover),
    );
  }

  /**
   * Rate limiting on /execute is keyed by authenticated caller identity
   * (req.callerId), so it is only meaningful -- and only mounted -- when
   * caller-auth itself is enabled. When callerAuth is "disabled" (local
   * development/tutorials only, never a real deployment), there is no
   * caller identity to key off, so this is skipped entirely rather than
   * silently falling back to an IP-keyed limit that would defeat the
   * whole point of keying by caller in the first place.
   */
  app.use(
    "/execute",
    ...(options.callerAuth !== "disabled"
      ? [
          createExecuteRateLimiter(
            executePerMinute,
            options.rateLimit?.executeStore,
          ),
        ]
      : []),
    createExecuteRouter(
      application,
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
    ),
  );

  /**
   * Verification
   */
  app.use("/verify", createVerifyRouter(application));

  app.use("/verification", createVerifyGetRouter(application));

  /**
   * Refusal Records (RFC-0021)
   *
   * Ownership-scoped lookup by ID -- the unauthenticated verification
   * route (POST /refusal/verify) is mounted above, before caller-auth.
   */
  app.use("/refusal", createRefusalGetRouter(application));

  /**
   * Execution Intents (ADR-0012)
   */
  app.use("/execution-intents", createExecutionIntentsRouter(application));
  /**
   * Receipts
   */
  app.use("/receipt", createReceiptRouter(application));
  app.use("/receipt/latest", createReceiptGetRouter(application));

  /**
   * Business Transactions
   */
  app.use(
    "/transactions",
    createTransactionsRouter(
      application,
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
    ),
  );

  /**
   * Policies
   */
  app.use("/policies", policyRoutes);

  /**
   * The policy a capability's requests must declare right now (G-66
   * follow up), so agents need not write a version into their code.
   */
  app.use(
    "/policies",
    createPolicyInEffectRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
    ),
  );

  /**
   * Policy Governance (maker-checker). Mounted at the same /policies
   * prefix as the router above -- path shapes don't collide (see
   * pending-policy-changes.ts's own routes).
   */
  app.use(
    "/policies",
    createPendingPolicyChangesRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
      options.stepUpVerifier,
      options.policyChangeApprovalService,
    ),
  );

  /**
   * Execution Trust Records
   */
  app.use(
    "/approval-issuers",
    createApprovalIssuersRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
      options.stepUpVerifier,
    ),
  );

  /**
   * External connectors (ADR-0013), maker checker.
   */
  app.use(
    "/external-connectors",
    createExternalConnectorsRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
      options.stepUpVerifier,
      undefined,
      options.externalEndpointLookup,
    ),
  );

  /**
   * Business signal sources (RFC-0023 phase 2), maker checker.
   */
  app.use(
    "/business-signal-sources",
    createBusinessSignalSourcesRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
      options.stepUpVerifier,
      undefined,
      options.externalEndpointLookup,
    ),
  );

  /**
   * Per-agent authority grants (RFC-0023 phase 3): maker checker for
   * which caller may have which capability decided, within which limits,
   * until when.
   */
  app.use(
    "/authority-grants",
    createAuthorityGrantsRouter(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
      options.stepUpVerifier,
    ),
  );

  app.use("/trust-records", createTrustRecordsRouter(application));

  /**
   * Replay
   */
  app.use("/replay", createReplayRouter(application));

  /**
   * Error handling
   *
   * Must be registered after all routes. Threaded with the same
   * auditSink every other caller-facing route uses (G-29,
   * docs/VERIFICATION-GAPS.md) so the one rejection category this file
   * itself fully handles -- a malformed/oversized request body, rejected
   * by express.json() before caller-auth middleware or any route handler
   * ever runs -- gets a best-effort audit record too, not only the
   * correct HTTP response.
   */
  app.use(
    createErrorHandler(
      options.callerAuth !== "disabled"
        ? options.callerAuth.auditSink
        : undefined,
    ),
  );

  return app;
}
