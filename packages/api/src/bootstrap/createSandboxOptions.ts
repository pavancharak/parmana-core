import { createPrivateKey } from "node:crypto";

import { parseCorsOrigins } from "../middleware/cors.js";
import type { SandboxApprover } from "../routes/sandbox-approvals.js";

/**
 * Every variable a built in connector reads. Sandbox mode refuses to
 * start while any of them is defined, even as an empty string, because
 * the connector factories register a connector for any defined value
 * (ADR-0014). tests/architecture keeps this list complete against
 * createConnectorRegistry and the connector and credential provider
 * factories it calls.
 */
export const BUILT_IN_CONNECTOR_VARIABLES = [
  "PAYTM_CONNECTOR_URL",
  "PAYTM_CONNECTOR_SHARED_SECRET",
  "PAYTM_CONNECTOR_TIMEOUT_MS",
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT",
  "HUBSPOT_BASE_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_INSTALLATION_ID",
  "GITHUB_BASE_URL",
  "PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID",
  "SLACK_BOT_TOKEN",
  "SLACK_BASE_URL",
] as const;

const APPROVER_VARIABLES = [
  "PARMANA_SANDBOX_APPROVER_ID",
  "PARMANA_SANDBOX_APPROVER_KEY_ID",
  "PARMANA_SANDBOX_APPROVER_PRIVATE_KEY",
] as const;

export interface SandboxOptions {
  /**
   * PARMANA_CORS_ORIGINS. Empty: no CORS header is sent.
   */
  readonly corsOrigins: readonly string[];

  /**
   * Present only with PARMANA_SANDBOX=true: mounts POST
   * /sandbox/approvals.
   */
  readonly sandboxApprover?: SandboxApprover;
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Reads PARMANA_CORS_ORIGINS and sandbox mode (ADR-0014), failing closed
 * at startup:
 *
 * - PARMANA_SANDBOX must be unset, "true" or "false".
 * - With PARMANA_SANDBOX=true: caller authentication must be on, no
 *   built in connector variable may be set, and the demo approver (PARMANA_SANDBOX_APPROVER_ID,
 *   PARMANA_SANDBOX_APPROVER_KEY_ID, PARMANA_SANDBOX_APPROVER_PRIVATE_KEY,
 *   an Ed25519 private key in PEM) must be complete.
 * - Without it: no demo approver variable may be set, so a demo key can
 *   never sit in a production environment unnoticed.
 */
export function createSandboxOptions(
  env: NodeJS.ProcessEnv = process.env,
): SandboxOptions {
  const corsOrigins = parseCorsOrigins(env.PARMANA_CORS_ORIGINS);
  const switchValue = env.PARMANA_SANDBOX?.trim();

  if (env.NODE_ENV === "production" && switchValue === "true") {
    throw new Error(
      "PARMANA_SANDBOX=true is refused when NODE_ENV=production: the demo approver must never run in production.",
    );
  }

  if (
    switchValue !== undefined &&
    switchValue !== "" &&
    switchValue !== "true" &&
    switchValue !== "false"
  ) {
    throw new Error(
      `PARMANA_SANDBOX must be "true", "false" or unset; got "${switchValue}".`,
    );
  }

  const sandbox = switchValue === "true";
  const approverSet = APPROVER_VARIABLES.filter((name) => isSet(env[name]));

  if (!sandbox) {
    if (approverSet.length > 0) {
      throw new Error(
        `${approverSet.join(", ")} set without PARMANA_SANDBOX=true. The demo approver exists only in a sandbox; remove these variables.`,
      );
    }

    return { corsOrigins };
  }

  if (env.PARMANA_AUTH_DISABLED?.trim() === "true") {
    throw new Error(
      "PARMANA_SANDBOX=true refuses to start with PARMANA_AUTH_DISABLED=true: the demo approver must stay behind the published demo key.",
    );
  }

  const connectors = BUILT_IN_CONNECTOR_VARIABLES.filter(
    (name) => env[name] !== undefined,
  );

  if (connectors.length > 0) {
    throw new Error(
      `PARMANA_SANDBOX=true refuses to start while a built in connector is configured: ${connectors.join(", ")}. A sandbox must never reach a real system.`,
    );
  }

  const missing = APPROVER_VARIABLES.filter((name) => !isSet(env[name]));

  if (missing.length > 0) {
    throw new Error(
      `PARMANA_SANDBOX=true needs the demo approver: ${missing.join(", ")} not set.`,
    );
  }

  const privateKey = createPrivateKey(
    // Hosting dashboards often store a PEM on one line with literal \n.
    String(env.PARMANA_SANDBOX_APPROVER_PRIVATE_KEY).replace(/\\n/g, "\n"),
  );

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(
      "PARMANA_SANDBOX_APPROVER_PRIVATE_KEY must be an Ed25519 private key, as every approver key is.",
    );
  }

  return {
    corsOrigins,
    sandboxApprover: {
      approverId: String(env.PARMANA_SANDBOX_APPROVER_ID).trim(),
      keyId: String(env.PARMANA_SANDBOX_APPROVER_KEY_ID).trim(),
      privateKey,
    },
  };
}
