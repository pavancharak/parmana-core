import { loadConfig, type Config } from "@parmana/shared";

import { StaticKeyAuthenticator } from "../auth/StaticKeyAuthenticator.js";
import type { CallerAuthenticator } from "../auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

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
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PARMANA_AUTH_DISABLED=true is refused when NODE_ENV=production. " +
          "Caller authentication cannot be disabled in production.",
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
    authenticator: new StaticKeyAuthenticator(config.auth.keys),
    auditSink: createCallerAuditSink(),
  };
}
