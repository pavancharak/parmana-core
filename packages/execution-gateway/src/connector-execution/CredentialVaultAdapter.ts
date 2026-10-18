import type {
  CredentialVault,
  ExecutionCredential,
} from "@parmana/execution-control";

import type { CredentialProvider } from "@parmana/connector-sdk";

/**
 * Adapts a CredentialProvider into execution-control's CredentialVault
 * contract, so the existing SecureConnector / ConnectorRegistry machinery
 * (unchanged) can resolve credentials through any provider.
 *
 * Extends execution-control's credential surface — never replaces
 * InMemoryCredentialVault. Callers that want a static map can keep using
 * InMemoryCredentialVault directly, or use StaticCredentialProvider here for
 * the same effect behind the provider seam.
 */
export class CredentialVaultAdapter implements CredentialVault {
  constructor(private readonly provider: CredentialProvider) {}

  async getCredential(connectorId: string): Promise<ExecutionCredential> {
    const handle = await this.provider.resolve(connectorId);
    return { value: handle };
  }
}
