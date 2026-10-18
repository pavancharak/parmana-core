import type { ExternalPolicyBindingSource } from "@parmana/policy";
import type { ExternalConnectorRepository } from "@parmana/shared";

import { externalConnectorRepository } from "../repositories.js";

/**
 * The policy each active external connector registration binds to its
 * capability (ADR-0013), read from external_connectors on every request,
 * so an approved registration or revocation takes effect on the next
 * one. A read error propagates, and CapabilityPolicyBinder refuses the
 * request.
 */
export function createExternalPolicyBindingSource(
  repository: ExternalConnectorRepository = externalConnectorRepository,
): ExternalPolicyBindingSource {
  return {
    async policyFor(capability: string): Promise<string | undefined> {
      return (await repository.findActive(capability))?.policy;
    },
  };
}
