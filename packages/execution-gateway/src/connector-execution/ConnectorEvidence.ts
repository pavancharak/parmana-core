import type { CryptoProvider } from "@parmana/crypto";
import { TrustRecordHasher } from "@parmana/crypto";

import type {
  ConnectorCapability,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";
import type { ConnectorVersion } from "@parmana/connector-sdk";
import { formatConnectorVersion } from "@parmana/connector-sdk";

/**
 * Connector execution evidence.
 *
 * This is NOT a second evidence model. It is placed, verbatim, inside
 * ExecutionResult.metadata.connector, which ExecutionEvidenceBuilder
 * (@parmana/runtime, unchanged) already forwards into
 * ExecutionEvidence.attributes.connector. It is hashed as part of the
 * existing Execution Trust Record hash — via the existing TrustRecordHasher
 * — not by any alternative hash.
 */
export interface ConnectorEvidence {
  readonly connectorId: string;
  readonly connectorVersion: string;
  readonly capability: ConnectorCapability;
  readonly sanitizedEndpoint: string;
  readonly credentialProviderId: string;
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly responseSummary: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly connectorEvidenceHash: string;

  /**
   * Whether this evidence includes an independent, vendor-originated
   * cryptographic confirmation (e.g. a signature or checksum the
   * vendor itself produced over its own response), as opposed to only
   * what this connector's own HTTP call observed and Parmana hashed.
   * Defaults to false and, as of this field's introduction
   * (docs/VERIFICATION-GAPS.md G-45's Record-3 half), no connector in
   * this codebase sets it true -- confirmed for every in-process
   * adapter (HubSpot, GitHub, Slack) and, for the one connector that
   * touches real money (Paytm), documented explicitly in
   * GatewayPaytmAdapter's own doc comment: that adapter forwards to a
   * separate out-of-process service which holds Paytm's own checksum
   * verification, out of this codebase's reach. Exists so this
   * architectural limitation is visible in every piece of evidence
   * itself, not only in prose documentation -- and so a future
   * connector that does add real vendor-signature verification has
   * somewhere to record it.
   */
  readonly vendorConfirmationVerified: boolean;
}

const SENSITIVE_KEY_PATTERN =
  /credential|secret|token|apikey|api_key|password|authorization/i;

/**
 * Strips keys that look credential-shaped from connector-supplied response
 * metadata before it is recorded as evidence. Defense in depth: connectors
 * are documented to never put secrets in ConnectorResponse.metadata, but
 * evidence must never leak one even if a connector author gets that wrong.
 */
export function redactSensitiveKeys(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : val;
  }
  return Object.freeze(redacted);
}

/**
 * Strips credentials and query parameters from a URL-shaped target so the
 * recorded endpoint never carries secret material embedded in the URL
 * itself (userinfo, API-key query params).
 */
export function sanitizeEndpoint(target: string): string {
  try {
    const url = new URL(target);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return target.split("?")[0] ?? target;
  }
}

export interface BuildConnectorEvidenceOptions {
  readonly connectorId: string;
  readonly connectorVersion: ConnectorVersion;
  readonly credentialProviderId: string;
  readonly request: ConnectorRequest;
  readonly response: ConnectorResponse;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly crypto: CryptoProvider;

  /**
   * Set true only by a caller that has independently verified a
   * vendor-originated cryptographic confirmation over this specific
   * response -- see ConnectorEvidence.vendorConfirmationVerified.
   * Defaults to false; no current call site passes true.
   */
  readonly vendorConfirmationVerified?: boolean;
}

export async function buildConnectorEvidence(
  options: BuildConnectorEvidenceOptions,
): Promise<ConnectorEvidence> {
  const hasher = new TrustRecordHasher(options.crypto);

  const requestSummary = Object.freeze({
    businessTransactionId: options.request.businessTransactionId,
    action: options.request.action,
    target: sanitizeEndpoint(options.request.target),
    parameters: redactSensitiveKeys(options.request.parameters),
  });

  const responseSummary = Object.freeze({
    success: options.response.success,
    metadata: redactSensitiveKeys(options.response.metadata),
  });

  const unhashed = {
    connectorId: options.connectorId,
    connectorVersion: formatConnectorVersion(options.connectorVersion),
    capability: options.request.capability,
    sanitizedEndpoint: sanitizeEndpoint(options.request.target),
    credentialProviderId: options.credentialProviderId,
    requestSummary,
    responseSummary,
    startedAt: options.startedAt.toISOString(),
    completedAt: options.completedAt.toISOString(),
    vendorConfirmationVerified: options.vendorConfirmationVerified ?? false,
  };

  const connectorEvidenceHash = await hasher.hash(unhashed);

  return Object.freeze({ ...unhashed, connectorEvidenceHash });
}
