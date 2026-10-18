import type { CryptoProvider } from "@parmana/crypto";
import type {
  ConnectorExecutor,
  ConnectorReleaseInput,
  ExecutionCredential,
} from "@parmana/execution-control";
import type { ExecutableContent, ExecutionResult } from "@parmana/shared";

import { buildConnectorEvidence } from "./ConnectorEvidence.js";
import type {
  Connector,
  ConnectorExecutionContext,
  ConnectorRequest,
} from "@parmana/connector-sdk";
import { isCredentialHandle } from "@parmana/connector-sdk";
import type {
  ConnectorMetadata,
  ConnectorVersion,
} from "@parmana/connector-sdk";
import {
  connectorVersionsEqual,
  formatConnectorVersion,
} from "@parmana/connector-sdk";

export interface SdkConnectorExecutorOptions {
  readonly connector: Connector;
  readonly metadata: ConnectorMetadata;
  readonly credentialProviderId: string;
  readonly crypto: CryptoProvider;

  /**
   * When supplied, execution is rejected if the connector's own reported
   * metadata.version does not match — closing the "connector version
   * mismatch" gap the Gateway must fail closed on (e.g. a rolling
   * deployment that swapped in a different connector build).
   */
  readonly expectedVersion?: ConnectorVersion;

  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Adapts the SDK's Connector contract into execution-control's
 * ConnectorExecutor — the existing, unchanged extension seam
 * InMemorySecureConnector already calls after policy and credential-vault
 * checks pass. This is the only place the Gateway's connector-execution
 * layer touches the execution-control execution path, and it does so purely
 * by implementing an existing interface, not by modifying it.
 */
export class SdkConnectorExecutor implements ConnectorExecutor {
  constructor(private readonly options: SdkConnectorExecutorOptions) {}

  async execute(
    content: Readonly<ExecutableContent>,
    credential: ExecutionCredential,
    release?: ConnectorReleaseInput,
  ): Promise<ExecutionResult> {
    const { connector, metadata } = this.options;

    if (
      this.options.expectedVersion !== undefined &&
      !connectorVersionsEqual(metadata.version, this.options.expectedVersion)
    ) {
      throw new Error(
        `Connector version mismatch for "${connector.connectorId}": expected ` +
          `${formatConnectorVersion(this.options.expectedVersion)}, found ` +
          `${formatConnectorVersion(metadata.version)}.`,
      );
    }

    if (metadata.health.status === "unavailable") {
      throw new Error(
        `Connector "${connector.connectorId}" is unavailable (${metadata.health.reason ?? "no reason reported"}).`,
      );
    }

    const capability = content.action;
    if (!connector.capabilities.includes(capability)) {
      throw new Error(
        `Connector "${connector.connectorId}" does not declare capability "${capability}".`,
      );
    }

    if (!isCredentialHandle(credential.value)) {
      throw new Error(
        `Connector "${connector.connectorId}" rejected a raw credential; only a resolved ` +
          `CredentialHandle produced by a CredentialProvider is accepted.`,
      );
    }

    const request: ConnectorRequest = Object.freeze({
      capability,
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
    });

    const startedAt = new Date();
    const context: ConnectorExecutionContext = Object.freeze({
      credential: credential.value,
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      requestedAt: startedAt,
      ...(release !== undefined
        ? {
            release: Object.freeze({
              authorizationId: release.authorization.payload.authorizationId,
              policy: Object.freeze({
                name: release.authorization.payload.policyName,
                version: release.authorization.payload.policyVersion,
                ...(release.authorization.payload.policyContentHash !==
                undefined
                  ? {
                      contentHash:
                        release.authorization.payload.policyContentHash,
                    }
                  : {}),
              }),
              approvals: Object.freeze(
                release.approvals.map((approval) =>
                  Object.freeze({ ...approval }),
                ),
              ),
              // Taken from the signed authorization, never the request.
              ...(release.authorization.payload.businessConditions !==
                undefined && {
                conditions: Object.freeze(
                  release.authorization.payload.businessConditions.map(
                    (condition) =>
                      Object.freeze({
                        signalKey: condition.signalKey,
                        source: condition.source,
                        claim: condition.claim,
                        subject: condition.subject,
                        value: condition.value,
                        validUntil: condition.validUntil,
                      }),
                  ),
                ),
              }),
            }),
          }
        : {}),
    });

    const response = await connector.execute(request, context);
    const completedAt = new Date();

    const evidence = await buildConnectorEvidence({
      connectorId: connector.connectorId,
      connectorVersion: metadata.version,
      credentialProviderId: this.options.credentialProviderId,
      request,
      response,
      startedAt,
      completedAt,
      crypto: this.options.crypto,
    });

    return {
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
      success: response.success,
      executedAt: completedAt,
      metadata: { connector: evidence },
    };
  }
}
