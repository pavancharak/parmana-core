import type { CredentialVault, ExecutionCredential } from "./types.js";

export class InMemoryCredentialVault implements CredentialVault {
  private readonly credentials = new Map<string, ExecutionCredential>();

  setCredential(connectorId: string, credential: ExecutionCredential): void {
    this.credentials.set(connectorId, credential);
  }

  async getCredential(connectorId: string): Promise<ExecutionCredential> {
    const credential = this.credentials.get(connectorId);
    if (credential === undefined)
      throw new Error(`No credential for connector: ${connectorId}.`);
    return credential;
  }
}
