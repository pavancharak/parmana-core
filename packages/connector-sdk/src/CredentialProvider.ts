/**
 * Credential resolution seam.
 *
 * Credential resolution happens exclusively inside the Execution Gateway
 * (via a CredentialVault backed by one of these providers). Connectors never
 * resolve, retrieve, discover, or store credentials themselves — they only
 * ever receive an opaque, already-resolved CredentialHandle.
 *
 * This file defines the interface seam for future providers (HashiCorp
 * Vault, AWS Secrets Manager, Azure Key Vault, Google Secret Manager). Only
 * the seam is defined here; no cloud SDK integration is implemented.
 */

const CREDENTIAL_HANDLE_BRAND = Symbol(
  "parmana.connector-sdk.credential-handle",
);

/**
 * Opaque credential material resolved by a CredentialProvider.
 *
 * `value` is never logged, never included in ConnectorEvidence, and never
 * serialized into an Execution Trust Record. It exists only to be read,
 * ephemerally, by a Connector's own execution call (e.g. an HTTP header).
 */
export interface CredentialHandle {
  readonly providerId: string;
  readonly credentialId: string;
  readonly value: unknown;
}

/**
 * Marks a CredentialHandle as having been produced by a CredentialProvider,
 * as opposed to a raw value supplied directly by a caller. SdkConnectorExecutor
 * rejects any credential that is not branded this way, closing the "raw
 * credential supplied" gap the Gateway must fail closed on.
 */
export function brandCredentialHandle(
  handle: CredentialHandle,
): CredentialHandle {
  const branded = { ...handle } as CredentialHandle & Record<symbol, unknown>;
  branded[CREDENTIAL_HANDLE_BRAND] = true;
  return Object.freeze(branded);
}

export function isCredentialHandle(value: unknown): value is CredentialHandle {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<symbol, unknown>)[CREDENTIAL_HANDLE_BRAND] === true;
}

/**
 * Resolves opaque credential material for a connector.
 *
 * Implementations MUST NOT throw errors that embed the resolved secret
 * value — only identifiers (connectorId, providerId, credentialId) may
 * appear in error messages.
 */
export interface CredentialProvider {
  readonly providerId: string;
  resolve(connectorId: string): Promise<CredentialHandle>;
}

/**
 * Resolves credentials from process environment variables.
 *
 * [FUTURE]: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and
 * Google Secret Manager providers will implement the same CredentialProvider
 * interface. None are implemented in this milestone.
 */
export class EnvironmentCredentialProvider implements CredentialProvider {
  readonly providerId = "environment";

  constructor(
    private readonly connectorEnvironmentVariable: Readonly<
      Record<string, string>
    >,
    private readonly environment: Readonly<
      Record<string, string | undefined>
    > = process.env,
  ) {}

  async resolve(connectorId: string): Promise<CredentialHandle> {
    const variableName = this.connectorEnvironmentVariable[connectorId];
    if (variableName === undefined) {
      throw new Error(
        `No environment credential mapping configured for connector: ${connectorId}.`,
      );
    }
    const value = this.environment[variableName];
    if (value === undefined) {
      throw new Error(
        `Environment variable "${variableName}" for connector "${connectorId}" is not set.`,
      );
    }
    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: variableName,
      value: Object.freeze({ token: value }),
    });
  }
}

/**
 * Resolves credentials from an in-memory map.
 *
 * Intended for hermetic tests and local development only.
 */
export class StaticCredentialProvider implements CredentialProvider {
  readonly providerId = "static";

  private readonly credentials = new Map<string, unknown>();

  constructor(entries: Readonly<Record<string, unknown>> = {}) {
    for (const [connectorId, value] of Object.entries(entries)) {
      this.credentials.set(connectorId, value);
    }
  }

  set(connectorId: string, value: unknown): void {
    this.credentials.set(connectorId, value);
  }

  async resolve(connectorId: string): Promise<CredentialHandle> {
    if (!this.credentials.has(connectorId)) {
      throw new Error(
        `No static credential configured for connector: ${connectorId}.`,
      );
    }
    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: connectorId,
      value: this.credentials.get(connectorId),
    });
  }
}
