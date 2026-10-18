import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyRepository } from "../application.js";
import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { PolicyChangeApprovalService } from "../governance/PolicyChangeApprovalService.js";

/**
 * Creates the PolicyChangeApprovalService used by
 * pending-policy-changes.ts's approve handler (Policy Governance,
 * maker-checker) to write the live policies/{name}/{version}/policy.json
 * file and produce a signed PolicyChangeApprovalRecord.
 *
 * Deliberately reuses application.ts's own `policyRepository` singleton
 * -- the same FilePolicyRepository instance (and therefore the same
 * PARMANA_POLICY_DIR) that pending-policy-changes.ts already reads
 * from for the GET /pending-changes diff view, so a write here and a
 * read there always agree on where policies live. Mirrors
 * createPolicyChangeStepUpVerifier.ts's own "bootstrap function
 * bundles construction, server.ts calls it once" pattern.
 */
export function createPolicyChangeApprovalService(): PolicyChangeApprovalService {
  return new PolicyChangeApprovalService({
    policyRepository,
    policyChangeCrypto: new PolicyChangeCrypto(),
    policyChangeApprovalRecordRepository,
  });
}
