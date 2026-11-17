import { policyV2 } from "@parmana/policy";

import { PolicyV2ForbiddenError } from "./policyV2Register.js";

/**
 * Replays a recorded policy version 2 decision from its evidence, using the policy versions the
 * register holds. The replay re-runs the decision as it was made, with the keys, approvers and
 * thresholds recorded then, and reports any difference. It changes nothing.
 */

/** The part of the state store the replay uses. The Postgres store satisfies it. */
export interface PolicyV2ReplayStateStore {
  load<T>(
    component: "register",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  readEvidence(): Promise<policyV2.evidence.EvidenceRecord[]>;
}

export interface PolicyV2ReplayResult {
  readonly recordId: string;
  readonly reproduced: boolean;
  readonly differences: readonly string[];
}

export interface PolicyV2ReplayServiceOptions {
  readonly store: PolicyV2ReplayStateStore;
}

export class PolicyV2ReplayService {
  constructor(private readonly options: PolicyV2ReplayServiceOptions) {}

  /**
   * Replays one recorded decision. Only a caller that holds a register role may replay. Returns
   * undefined if no record has that id.
   */
  async replayRecord(
    callerId: string,
    recordId: string,
  ): Promise<PolicyV2ReplayResult | undefined> {
    const registerState =
      await this.options.store.load<policyV2.register.RegisterSnapshot>(
        "register",
      );
    const register = new policyV2.register.PolicyRegister(() => new Date());
    if (registerState !== undefined) register.load(registerState.body);
    if (register.rolesOf(callerId).length === 0) {
      throw new PolicyV2ForbiddenError("The caller holds no register role.");
    }

    const record = (await this.options.store.readEvidence()).find(
      (r) => r.recordId === recordId,
    );
    if (record === undefined) return undefined;

    const policies = new policyV2.evidence.PolicyStore();
    for (const version of register.listPolicyVersions())
      policies.put(version.policy);
    const result = await policyV2.evidence.replay(record, policies);
    return {
      recordId,
      reproduced: result.reproduced,
      differences: [...result.differences],
    };
  }
}
