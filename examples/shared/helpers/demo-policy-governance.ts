import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import type { Policy, PolicyExecutionVerifier } from "@parmana/policy";
import { PendingPolicyChangeStatus } from "@parmana/shared";
import type { PendingPolicyChange } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { PolicyChangeApprovalService } from "../../../packages/api/src/governance/PolicyChangeApprovalService.js";
import { PolicyGovernanceExecutionVerifier } from "../../../packages/api/src/governance/PolicyGovernanceExecutionVerifier.js";

//
// Policy binding for the examples. The Gateway refuses to run without a
// policy repository and a policy approval verifier, and it refuses any policy
// whose content has no Policy Governance approval record. These helpers give
// an example that binding the same way tutorial 104 does: every policy is
// approved through PolicyChangeApprovalService, and the Gateway verifies each
// approval with PolicyGovernanceExecutionVerifier.
//
// The approvals here are demo approvals. A real deployment's approvals come
// from its maker-checker flow, not from the examples.
//
// Both helpers work on a scratch copy, so no tracked fixture is written.
//

export interface GovernedPolicies {
  readonly directory: string;
  readonly policyRepository: FilePolicyRepository;
  readonly policyApprovalVerifier: PolicyExecutionVerifier;
}

const DEMO_MAKER = "example-maker";
const DEMO_CHECKER = "example-checker";

/**
 * Copies a policy directory (laid out as <name>/<version>/policy.json) to a
 * scratch location and approves every policy in the copy.
 */
export async function governedPolicyDirectory(
  sourceDirectory: string,
): Promise<GovernedPolicies> {
  const directory = mkdtempSync(path.join(tmpdir(), "parmana-example-policies-"));
  cpSync(sourceDirectory, directory, { recursive: true });

  const policyRepository = new FilePolicyRepository(directory);
  const found: { name: string; version: string }[] = [];

  for (const name of readdirSync(directory)) {
    const nameDir = path.join(directory, name);
    if (!statSync(nameDir).isDirectory()) continue;
    for (const version of readdirSync(nameDir)) {
      const versionDir = path.join(nameDir, version);
      if (
        statSync(versionDir).isDirectory() &&
        existsSync(path.join(versionDir, "policy.json"))
      ) {
        found.push({ name, version });
      }
    }
  }

  return approveAll(directory, policyRepository, found);
}

/**
 * Saves the given policy objects into a scratch directory and approves each.
 * For examples that build their policy in code.
 */
export async function governedPolicyObjects(
  policies: readonly Policy[],
): Promise<GovernedPolicies> {
  const directory = mkdtempSync(path.join(tmpdir(), "parmana-example-policies-"));
  const policyRepository = new FilePolicyRepository(directory);

  for (const policy of policies) {
    await policyRepository.save(policy.policyId, policy.policyVersion, policy);
  }

  return approveAll(
    directory,
    policyRepository,
    policies.map((policy) => ({
      name: policy.policyId,
      version: policy.policyVersion,
    })),
  );
}

async function approveAll(
  directory: string,
  policyRepository: FilePolicyRepository,
  policies: readonly { name: string; version: string }[],
): Promise<GovernedPolicies> {
  const policyChangeCrypto = new PolicyChangeCrypto();
  const records = new MemoryPolicyChangeApprovalRecordRepository();

  const approvals = new PolicyChangeApprovalService({
    policyRepository,
    policyChangeCrypto,
    policyChangeApprovalRecordRepository: records,
  });

  for (const { name, version } of policies) {
    const policy = await policyRepository.load(name, version);

    const change: PendingPolicyChange = {
      pendingPolicyChangeId: randomUUID(),
      policyName: name,
      policyVersion: version,
      proposedContent: policy as unknown as PendingPolicyChange["proposedContent"],
      proposedBy: DEMO_MAKER,
      proposedAt: new Date(),
      status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      reason: "example policy approval",
    };

    await approvals.approve(change, DEMO_CHECKER);
  }

  return {
    directory,
    policyRepository,
    policyApprovalVerifier: new PolicyGovernanceExecutionVerifier(
      records,
      policyChangeCrypto,
    ),
  };
}
