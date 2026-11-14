import { loadConfig, type Config } from "@parmana/shared";

import { StaticKeyAuthenticator } from "../auth/StaticKeyAuthenticator.js";
import type { CallerAuthenticator } from "../auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { callerKeyRevocationRepository } from "../repositories.js";

import { createCallerAuditSink } from "./createCallerAuditSink.js";

export type CallerAuthBootstrap =
  | { readonly disabled: true }
  | {
      readonly disabled: false;
      readonly authenticator: CallerAuthenticator;
      readonly auditSink: CallerAuditSink;
    };

/**
 * Creates the caller authenticator that gates every API
 * route except /health.
 *
 * Fail-closed by default: refuses to start with no keys
 * configured (PARMANA_API_KEYS empty or unset) unless
 * PARMANA_AUTH_DISABLED=true is set explicitly. That flag
 * is for local development and tutorials only and must
 * never be set in a real deployment; setting it logs a
 * loud warning at startup rather than failing silently.
 */
export function createCallerAuthenticator(
  config: Config = loadConfig(),
): CallerAuthBootstrap {
  if (config.auth.disabled) {
    // Fail closed: caller authentication may be disabled only when NODE_ENV
    // is exactly "development" or "test". Any other value, including unset,
    // is refused, so a deployment with a missing or unexpected NODE_ENV cannot
    // run without caller authentication.
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv !== "development" && nodeEnv !== "test") {
      throw new Error(
        "PARMANA_AUTH_DISABLED=true is refused unless NODE_ENV is exactly " +
          '"development" or "test". Caller authentication cannot be disabled ' +
          "in any other environment.",
      );
    }

    console.warn(
      "\nWARNING: PARMANA_AUTH_DISABLED=true. The API is accepting " +
        "requests with no caller authentication. This must never be set " +
        "in a real deployment.\n",
    );

    return { disabled: true };
  }

  if (config.auth.keys.length === 0) {
    throw new Error(
      "No caller authentication keys are configured (PARMANA_API_KEYS is " +
        "empty or unset). Refusing to start with no caller authentication. " +
        "Set PARMANA_API_KEYS, or set PARMANA_AUTH_DISABLED=true for local " +
        "development only.",
    );
  }

  return {
    disabled: false,
    authenticator: new StaticKeyAuthenticator(
      config.auth.keys,
      callerKeyRevocationRepository,
    ),
    auditSink: createCallerAuditSink(),
  };
}
