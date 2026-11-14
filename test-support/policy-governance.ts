import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import type { Policy, PolicyRepository } from "@parmana/policy";
import {
  PendingPolicyChangeStatus,
  type PendingPolicyChange,
} from "@parmana/shared";

import { PolicyChangeApprovalService } from "../packages/api/src/governance/PolicyChangeApprovalService.js";
import { policyChangeApprovalRecordRepository } from "../packages/api/src/repositories.js";

/**
 * TEST DATA ONLY. Never imported by production code.
 *
 * Seeds a signed policy-governance approval record for every policy version
 * under the policy directory, through the real PolicyChangeApprovalService,
 * into the same approval repository the runtime reads. Executions in tests
 * are then governed exactly as in production (D19). The maker and checker
 * are fixture identities, and the policy files are not rewritten: the save
 * step is a no-op.
 */
const FIXTURE_MAKER = "test-fixture-maker";
const FIXTURE_CHECKER = "test-fixture-checker";

let approvalCounter = 0;

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function policyService(policyDir: string): {
  base: FilePolicyRepository;
  service: PolicyChangeApprovalService;
} {
  const base = new FilePolicyRepository(policyDir);

  const readOnly: PolicyRepository = {
    load: (name, version) => base.load(name, version),
    save: async () => undefined,
  };

  return {
    base,
    service: new PolicyChangeApprovalService({
      policyRepository: readOnly,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    }),
  };
}

function policyDirectory(): string {
  return path.resolve(
    process.cwd(),
    process.env.PARMANA_POLICY_DIR ?? "./policies",
  );
}

/**
 * Approves one policy version, making it the version in effect. Each call
 * uses a new pending change id, so the approval is a new record, not a
 * repeat of an earlier one. A version approved earlier is superseded by a
 * later approval of the same policy name (PolicyGovernanceExecutionVerifier).
 */
export async function approvePolicyVersion(
  name: string,
  version: string,
): Promise<void> {
  const dir = policyDirectory();
  const { base, service } = policyService(dir);
  const policy: Policy = await base.load(name, version);

  approvalCounter += 1;

  const change: PendingPolicyChange = {
    pendingPolicyChangeId: `test-ppc-${name}-${version}-${approvalCounter}`,
    policyName: name,
    policyVersion: version,
    proposedContent:
      policy as unknown as PendingPolicyChange["proposedContent"],
    proposedBy: FIXTURE_MAKER,
    proposedAt: new Date("2026-11-14T00:00:00.000Z"),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    reason: "test fixture: seeded policy-governance approval",
  };

  await service.approve(change, FIXTURE_CHECKER);
}

/**
 * Approves every policy version under the policy directory, in ascending
 * version order, so the highest version of each name is the one in effect.
 * Older versions are superseded, as in production. A test that needs an
 * older version in effect calls approvePolicyVersion for it afterwards.
 */
export async function seedPolicyGovernanceApprovals(): Promise<void> {
  const dir = policyDirectory();

  if (!existsSync(dir)) {
    return;
  }

  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) {
      continue;
    }

    const versions = readdirSync(path.join(dir, name.name), {
      withFileTypes: true,
    })
      .filter((v) => v.isDirectory())
      .map((v) => v.name)
      .sort(compareVersions);

    for (const version of versions) {
      await approvePolicyVersion(name.name, version);
    }
  }
}
