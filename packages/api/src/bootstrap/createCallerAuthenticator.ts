import { loadConfig, type Config } from "@parmana/shared";

import { StaticKeyAuthenticator } from "../auth/StaticKeyAuthenticator.js";
import { CompositeCallerAuthenticator } from "../auth/CompositeCallerAuthenticator.js";
import { GitHubOidcAuthenticator } from "../auth/GitHubOidcAuthenticator.js";
import { probeOidcPolicy } from "../auth/probeOidcPolicy.js";
import type { CallerAuthenticator } from "../auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

import {
  LOCAL_MODE_VARIABLE,
  assertLocalModeConfigured,
  localModeEnabled,
} from "./localMode.js";
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
  assertLocalModeConfigured();

  if (config.auth.disabled) {
    // Fail closed: caller authentication may be disabled only in local mode
    // (PARMANA_LOCAL_MODE=true under NODE_ENV "test" or "development"). NODE_ENV
    // alone does not disable it, so a misconfigured NODE_ENV cannot run a real
    // server without caller authentication.
    if (!localModeEnabled()) {
      throw new Error(
        "PARMANA_AUTH_DISABLED=true is refused unless local mode is on: " +
          `${LOCAL_MODE_VARIABLE}=true and NODE_ENV is exactly "test" or ` +
          '"development". Caller authentication cannot be disabled in any ' +
          "other environment.",
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

  const staticKeys = new StaticKeyAuthenticator(
    config.auth.keys,
    callerKeyRevocationRepository,
  );

  return {
    disabled: false,
    authenticator: probeOidcEnabled(config)
      ? new CompositeCallerAuthenticator(
          probeOidcAuthenticator(config),
          staticKeys,
        )
      : staticKeys,
    auditSink: createCallerAuditSink(),
  };
}

function probeOidcEnabled(config: Config): boolean {
  return config.auth.probeOidc?.enabled === true;
}

/**
 * Builds the GitHub OIDC authenticator for the kill-switch probe. Refuses to start
 * when the repository id is missing or not numeric, since the pinned claim cannot
 * be checked without it.
 */
function probeOidcAuthenticator(config: Config): CallerAuthenticator {
  const repositoryId = config.auth.probeOidc?.repositoryId;
  if (repositoryId === undefined || !/^\d+$/.test(repositoryId)) {
    throw new Error(
      "PARMANA_PROBE_OIDC_ENABLED=true needs PARMANA_PROBE_REPOSITORY_ID set to the " +
        "numeric id of the repository (digits only). Refusing to start with an " +
        "unpinned probe identity.",
    );
  }

  return new GitHubOidcAuthenticator({
    policy: probeOidcPolicy(repositoryId),
  });
}
