/**
 * The register for policy schema version 2: sources, actions and thresholds,
 * with their owners and approvals.
 *
 * Design: docs/internal/design/CONSOLIDATED-DESIGN-AND-DECISIONS.md, sections 4.2, 5.1 to 5.7.
 *
 * Standalone. The runtime does not use it yet. Every change is proposed by one
 * person and approved by another. Placeholders are refused. Every change is
 * written to an append-only audit log. The register can be read as the
 * ValidationRegister that validatePolicyV2 checks against.
 */

import { createHash, type KeyObject } from "node:crypto";

import {
  validatePolicyV2,
  type ValidationRegister,
} from "./validatePolicyV2.js";
import { canonicalize, readEd25519PublicKey } from "./sourceAnswer.js";

export type Role =
  | "second-approver"
  | "risk-function"
  | "parmana-owner"
  | "source-owner"
  | "action-owner"
  | "gate-owner"
  | "reviewer";

/** A person acting in the register. Roles are granted by the Parmana owner. */
export interface Person {
  readonly id: string;
  readonly roles: readonly Role[];
}

export interface Approval {
  readonly by: string;
  readonly role: Role;
  readonly at: string;
}

export type SourceStatus = "pending" | "trusted" | "untrusted" | "retired";

export interface SignerInput {
  readonly kind: "system" | "intermediary";
  readonly operator?: string;
  readonly reviewDate?: string;
}

export interface SourceInput {
  readonly name: string;
  readonly dataOwner: string;
  readonly signer: SignerInput;
  readonly keyId: string;
  /** The Ed25519 public key (PEM) the source signs its answers with. Required (design 5.1). */
  readonly publicKeyPem: string;
  /** Claim name to the unit the source states for it. */
  readonly claims: Readonly<Record<string, string>>;
  /** True if any policy uses this source to approve (tier 1 or tier 2). Set from the policies that use it. */
  readonly canApprove: boolean;
}

export interface SourceRecord extends SourceInput {
  readonly status: SourceStatus;
  readonly proposedBy: string;
  readonly approvals: readonly Approval[];
}

export interface ThresholdInput {
  readonly action: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly owner: string;
  readonly reason: string;
  readonly evidence: string;
  readonly nextReview: string;
  readonly highValue: boolean;
}

export interface ThresholdRecord extends ThresholdInput {
  readonly status: "proposed" | "approved";
  readonly proposedBy: string;
  readonly approvals: readonly Approval[];
}

export interface ReviewSettings {
  readonly reviewWindowBusinessDays: number;
  readonly approvalValidityMinutes: number;
}

export interface ActionInput {
  readonly capability: string;
  readonly owner: string;
  readonly successor: string;
  readonly reviewers: readonly string[];
  readonly review: ReviewSettings;
}

export interface ActionRecord extends ActionInput {
  readonly live: boolean;
  readonly testedTiers: readonly string[];
}

export interface AuditEvent {
  readonly at: string;
  readonly by: string;
  readonly event: string;
  readonly detail: string;
}

/** A role held by a caller. */
export interface RoleGrant {
  readonly callerId: string;
  readonly role: Role;
}

/**
 * The register's contents as plain data. The audit log is not part of it: each change's
 * audit events are taken with takeEvents and stored with the snapshot, in one write.
 */
export interface RegisterSnapshot {
  readonly sources: readonly SourceRecord[];
  readonly thresholds: readonly ThresholdRecord[];
  readonly actions: readonly ActionRecord[];
  readonly roles: readonly RoleGrant[];
  /** Missing in snapshots saved before approver keys existed; read as none. */
  readonly approverKeys?: readonly ApproverKeyRecord[];
  /** Missing in snapshots saved before policy versions existed; read as none. */
  readonly policyVersions?: readonly PolicyVersionRecord[];
}

export type PolicyVersionStatus = "proposed" | "approved" | "superseded";

/**
 * A policy version. Once proposed it cannot change: a change is a new version. Only one version
 * of an action is approved at a time; approving a new one supersedes the old.
 */
export interface PolicyVersionRecord {
  readonly capability: string;
  readonly policyVersion: string;
  /** The policy as proposed, in canonical form. */
  readonly policy: unknown;
  readonly hash: string;
  readonly proposedBy: string;
  readonly status: PolicyVersionStatus;
  readonly approvals: readonly Approval[];
}

/** The approved version of an action, if it may be used now. */
export interface ActivePolicy {
  readonly capability: string;
  readonly policyVersion: string;
  readonly policy: unknown;
  readonly hash: string;
}

/** An approver's public key. Approvals signed with it count only while the key is active. */
export interface ApproverKeyInput {
  readonly approverId: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
}

export type ApproverKeyStatus = "pending" | "active" | "revoked";

export interface ApproverKeyRecord extends ApproverKeyInput {
  readonly status: ApproverKeyStatus;
  readonly proposedBy: string;
  readonly approvals: readonly Approval[];
}

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterError";
  }
}

/** Caps from the design (decision D11). The register enforces them. */
export const MAX_REVIEW_WINDOW_BUSINESS_DAYS = 3;
export const MAX_APPROVAL_VALIDITY_MINUTES = 60;

const PLACEHOLDER = /<[^<>]+>/;
const CAPABILITY = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

function hasRole(person: Person, role: Role): boolean {
  return person.roles.includes(role);
}

/** Refuses any placeholder in any string of the input (plan 4.11, decision on placeholders). */
function refusePlaceholders(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (PLACEHOLDER.test(value)) {
      throw new RegisterError(
        `Placeholder at ${path}: "${value}". Replace it with a real value.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      refusePlaceholders(item, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      refusePlaceholders(item, `${path}.${key}`);
    }
  }
}

export class PolicyRegister {
  private readonly sources = new Map<string, SourceRecord>();
  private readonly thresholds = new Map<string, ThresholdRecord>();
  private readonly actions = new Map<string, ActionRecord>();
  private readonly roles = new Map<string, Set<Role>>();
  private readonly approverKeys = new Map<string, ApproverKeyRecord>();
  private readonly policyVersions = new Map<string, PolicyVersionRecord>();
  private readonly log: AuditEvent[] = [];
  private pending: AuditEvent[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  // ---- Roles ---------------------------------------------------------------

  /** The roles a caller holds, sorted. */
  rolesOf(callerId: string): Role[] {
    return [...(this.roles.get(callerId) ?? [])].sort();
  }

  /** The callers that hold a role, sorted. */
  holdersOf(role: Role): string[] {
    return [...this.roles.keys()]
      .filter((callerId) => this.roles.get(callerId)?.has(role))
      .sort();
  }

  /**
   * Sets up the first Parmana owner. Allowed only while no owner exists, so it cannot be used
   * to take over a register that already has one. Returns false if an owner already exists.
   */
  bootstrapOwner(callerId: string): boolean {
    if (!isNonEmpty(callerId))
      throw new RegisterError("A caller id is required.");
    if (this.holdersOf("parmana-owner").length > 0) return false;
    this.addRole(callerId, "parmana-owner");
    this.record("bootstrap", "role.bootstrap", `${callerId} parmana-owner`);
    return true;
  }

  /** Grants a role. Only the Parmana owner may grant one. */
  grantRole(by: Person, callerId: string, role: Role): void {
    if (!isNonEmpty(callerId))
      throw new RegisterError("A caller id is required.");
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "parmana-owner",
      "change roles",
    );
    if (this.roles.get(callerId)?.has(role)) return;
    this.addRole(callerId, role);
    this.record(by.id, "role.grant", `${callerId} ${role}`);
  }

  /**
   * Revokes a role. Only the Parmana owner may revoke one. The last Parmana owner cannot be
   * revoked, so the register always has an owner who can change roles.
   */
  revokeRole(by: Person, callerId: string, role: Role): void {
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "parmana-owner",
      "change roles",
    );
    if (!this.roles.get(callerId)?.has(role))
      throw new RegisterError(`${callerId} does not hold the ${role} role.`);
    if (
      role === "parmana-owner" &&
      this.holdersOf("parmana-owner").length === 1
    )
      throw new RegisterError(
        "The last Parmana owner cannot be revoked. Grant another Parmana owner first.",
      );
    this.roles.get(callerId)!.delete(role);
    if (this.roles.get(callerId)!.size === 0) this.roles.delete(callerId);
    this.record(by.id, "role.revoke", `${callerId} ${role}`);
  }

  /** The audit events recorded since the last call, and clears them. Saved with the snapshot. */
  takeEvents(): AuditEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  private addRole(callerId: string, role: Role): void {
    const held = this.roles.get(callerId) ?? new Set<Role>();
    held.add(role);
    this.roles.set(callerId, held);
  }

  // ---- Sources -------------------------------------------------------------

  /** Proposes a source. It is pending until its approvals are in. */
  proposeSource(input: SourceInput, by: Person): SourceRecord {
    refusePlaceholders(input, "source");
    requireRole(by, "source-owner", "propose a source");
    if (this.sources.has(input.name))
      throw new RegisterError(`Source "${input.name}" already exists.`);
    if (!isNonEmpty(input.publicKeyPem)) {
      throw new RegisterError(
        "A source must register a public key. Answers that are not signed are untrusted.",
      );
    }
    try {
      readEd25519PublicKey(input.publicKeyPem);
    } catch (error) {
      throw new RegisterError(
        error instanceof Error
          ? error.message
          : "The public key could not be read.",
      );
    }
    if (input.signer.kind === "intermediary") {
      if (
        !isNonEmpty(input.signer.operator) ||
        !isNonEmpty(input.signer.reviewDate)
      ) {
        throw new RegisterError(
          "An intermediary signer needs a named operator and a review date.",
        );
      }
    }
    const record: SourceRecord = {
      ...input,
      status: "pending",
      proposedBy: by.id,
      approvals: [],
    };
    this.sources.set(input.name, record);
    this.record(
      by.id,
      "source.proposed",
      `${input.name} (signer ${input.signer.kind}, canApprove ${input.canApprove})`,
    );
    return record;
  }

  /**
   * Approves a pending source. A second approver is always needed. A source that
   * can approve, or any intermediary, also needs the Parmana owner (design 5.4).
   * The source becomes trusted when every required approval is in.
   */
  approveSource(name: string, by: Person): SourceRecord {
    const source = this.requireSource(name);
    if (source.status !== "pending")
      throw new RegisterError(
        `Source "${name}" is ${source.status}, not pending.`,
      );
    if (by.id === source.proposedBy)
      throw new RegisterError("A person cannot approve their own proposal.");
    const role = this.nextSourceRole(source, by);
    const approvals = [
      ...source.approvals,
      { by: by.id, role, at: this.timestamp() },
    ];
    const needsOwner =
      source.canApprove || source.signer.kind === "intermediary";
    const haveSecond = approvals.some((a) => a.role === "second-approver");
    const haveOwner = approvals.some((a) => a.role === "parmana-owner");
    const status: SourceStatus =
      haveSecond && (!needsOwner || haveOwner) ? "trusted" : "pending";
    const updated: SourceRecord = { ...source, approvals, status };
    this.sources.set(name, updated);
    this.record(
      by.id,
      "source.approved",
      `${name} as ${role}; status ${status}`,
    );
    return updated;
  }

  /**
   * Records a change to a person's roles in the audit log. The roles themselves are held by
   * the role store, which the register does not read.
   */
  recordRoleChange(
    by: Person,
    callerId: string,
    role: Role,
    action: "grant" | "revoke",
  ): void {
    this.record(by.id, `role.${action}`, `${callerId} ${role}`);
  }

  // ---- Policy versions -----------------------------------------------------

  /**
   * Proposes a new version of a policy. Only the action owner proposes. The policy must name
   * the action, carry a new policyVersion, and pass every validator check against the register.
   */
  proposePolicy(policy: unknown, by: Person): PolicyVersionRecord {
    refusePlaceholders(policy, "policy");
    const body = policy as { capability?: unknown; policyVersion?: unknown };
    if (!isNonEmpty(body.capability))
      throw new RegisterError("A policy needs a capability.");
    const action = this.requireAction(body.capability);
    if (by.id !== action.owner)
      throw new RegisterError(
        `Only the action owner (${action.owner}) proposes a policy for ${body.capability}.`,
      );
    if (!isNonEmpty(body.policyVersion))
      throw new RegisterError("A policy needs a policyVersion.");
    const id = policyVersionId(body.capability, body.policyVersion);
    if (this.policyVersions.has(id))
      throw new RegisterError(
        `Policy version ${body.policyVersion} of ${body.capability} already exists. A change is a new version.`,
      );
    this.requireValid(policy);
    const record: PolicyVersionRecord = {
      capability: body.capability,
      policyVersion: body.policyVersion,
      policy: JSON.parse(canonicalize(policy)),
      hash: hashOf(policy),
      proposedBy: by.id,
      status: "proposed",
      approvals: [],
    };
    this.policyVersions.set(id, record);
    this.record(by.id, "policy.proposed", id);
    return record;
  }

  /**
   * Approves a proposed policy version. A second approver is always needed. A policy that
   * uses a source able to approve, or an intermediary, also needs the Parmana owner. The policy
   * is checked against the register again, so a source or threshold that has changed since the
   * proposal stops it. Approving the last required approval supersedes the approved version.
   */
  approvePolicy(
    capability: string,
    policyVersion: string,
    by: Person,
  ): PolicyVersionRecord {
    const id = policyVersionId(capability, policyVersion);
    const record = this.requirePolicyVersion(id);
    if (record.status !== "proposed")
      throw new RegisterError(
        `Policy version ${policyVersion} is ${record.status}, not proposed.`,
      );
    if (by.id === record.proposedBy)
      throw new RegisterError("A person cannot approve their own proposal.");
    if (record.approvals.some((a) => a.by === by.id))
      throw new RegisterError(
        `${by.id} has already approved this policy version.`,
      );

    const needsOwner = this.policyNeedsOwnerApproval(record.policy);
    const held = this.rolesOf(by.id);
    const haveSecond = record.approvals.some(
      (a) => a.role === "second-approver",
    );
    const haveOwner = record.approvals.some((a) => a.role === "parmana-owner");
    let role: Role;
    if (!haveSecond && held.includes("second-approver"))
      role = "second-approver";
    else if (needsOwner && !haveOwner && held.includes("parmana-owner"))
      role = "parmana-owner";
    else
      throw new RegisterError(
        `${by.id} holds no role that this policy version still needs.`,
      );

    this.requireValid(record.policy);
    const approvals = [
      ...record.approvals,
      { by: by.id, role, at: this.timestamp() },
    ];
    const complete =
      approvals.some((a) => a.role === "second-approver") &&
      (!needsOwner || approvals.some((a) => a.role === "parmana-owner"));

    if (complete) {
      for (const other of this.policyVersions.values()) {
        if (other.capability === capability && other.status === "approved")
          this.policyVersions.set(
            policyVersionId(other.capability, other.policyVersion),
            {
              ...other,
              status: "superseded",
            },
          );
      }
    }
    const updated: PolicyVersionRecord = {
      ...record,
      approvals,
      status: complete ? "approved" : "proposed",
    };
    this.policyVersions.set(id, updated);
    this.record(
      by.id,
      complete ? "policy.approved" : "policy.approval",
      `${id} as ${role}`,
    );
    return updated;
  }

  /**
   * The approved version of an action, if it may be used now. It is not used until the
   * action has passed the go-live gate. Returns undefined otherwise.
   */
  activePolicy(capability: string): ActivePolicy | undefined {
    const active = this.approvedVersion(capability);
    if (active === undefined) return undefined;
    const action = this.actions.get(capability);
    if (action === undefined || !action.live) return undefined;
    const used = usesOf(active.policy);
    let missing: string[];
    try {
      missing = this.gateMissing(
        capability,
        used.sources,
        used.thresholds,
        used.tiers,
      );
    } catch {
      return undefined;
    }
    if (missing.length > 0) return undefined;
    return {
      capability,
      policyVersion: active.policyVersion,
      policy: active.policy,
      hash: active.hash,
    };
  }

  private approvedVersion(capability: string): PolicyVersionRecord | undefined {
    return [...this.policyVersions.values()].find(
      (r) => r.capability === capability && r.status === "approved",
    );
  }

  getPolicyVersion(
    capability: string,
    policyVersion: string,
  ): PolicyVersionRecord | undefined {
    return this.policyVersions.get(policyVersionId(capability, policyVersion));
  }

  listPolicyVersions(): readonly PolicyVersionRecord[] {
    return [...this.policyVersions.values()];
  }

  private requirePolicyVersion(id: string): PolicyVersionRecord {
    const record = this.policyVersions.get(id);
    if (record === undefined)
      throw new RegisterError(`Policy version ${id} is not proposed.`);
    return record;
  }

  /** Refuses a policy that the validator rejects against the current register. */
  private requireValid(policy: unknown): void {
    const result = validatePolicyV2(policy, this.toValidationRegister());
    if (!result.ok) {
      const first = result.errors
        .slice(0, 3)
        .map((e) => `check ${e.check} at ${e.path}: ${e.message}`)
        .join("; ");
      throw new RegisterError(`The policy is not valid. ${first}`);
    }
  }

  /** True if the policy reads a source that can approve, or an intermediary. Those need the Parmana owner. */
  private policyNeedsOwnerApproval(policy: unknown): boolean {
    const signals =
      (
        policy as {
          signals?: Record<string, { provenance?: unknown; source?: unknown }>;
        }
      ).signals ?? {};
    return Object.values(signals).some((signal) => {
      if (signal.provenance !== "sourced" || typeof signal.source !== "string")
        return false;
      const source = this.sources.get(signal.source);
      return (
        source !== undefined &&
        (source.canApprove || source.signer.kind === "intermediary")
      );
    });
  }

  // ---- Approver keys -------------------------------------------------------

  /**
   * Proposes an approver's public key. Only the Parmana owner proposes one. The key is pending
   * until a second approver confirms it, and it counts for no approval until then.
   */
  proposeApproverKey(input: ApproverKeyInput, by: Person): ApproverKeyRecord {
    refusePlaceholders(input, "approver key");
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "parmana-owner",
      "propose an approver key",
    );
    if (!isNonEmpty(input.approverId) || !isNonEmpty(input.keyId))
      throw new RegisterError(
        "An approver key needs an approver id and a key id.",
      );
    const id = approverKeyId(input.approverId, input.keyId);
    if (this.approverKeys.has(id))
      throw new RegisterError(`Approver key ${id} already exists.`);
    if (!isNonEmpty(input.publicKeyPem))
      throw new RegisterError("An approver key needs a public key.");
    try {
      readEd25519PublicKey(input.publicKeyPem);
    } catch (error) {
      throw new RegisterError(
        error instanceof Error
          ? error.message
          : "The public key could not be read.",
      );
    }
    const record: ApproverKeyRecord = {
      ...input,
      status: "pending",
      proposedBy: by.id,
      approvals: [],
    };
    this.approverKeys.set(id, record);
    this.record(by.id, "approver-key.proposed", id);
    return record;
  }

  /**
   * Confirms a pending approver key. The confirmer must hold the second-approver role, must
   * not be the one who proposed the key, and must not be the approver whose key it is.
   */
  approveApproverKey(
    approverId: string,
    keyId: string,
    by: Person,
  ): ApproverKeyRecord {
    const id = approverKeyId(approverId, keyId);
    const key = this.requireApproverKey(id);
    if (key.status !== "pending")
      throw new RegisterError(
        `Approver key ${id} is ${key.status}, not pending.`,
      );
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "second-approver",
      "confirm an approver key",
    );
    if (by.id === key.proposedBy)
      throw new RegisterError("A person cannot confirm their own proposal.");
    if (by.id === approverId)
      throw new RegisterError("An approver cannot confirm their own key.");
    const updated: ApproverKeyRecord = {
      ...key,
      status: "active",
      approvals: [
        ...key.approvals,
        { by: by.id, role: "second-approver", at: this.timestamp() },
      ],
    };
    this.approverKeys.set(id, updated);
    this.record(by.id, "approver-key.approved", id);
    return updated;
  }

  /** Revokes an approver key at once. Only the Parmana owner revokes one, and a reason is required. */
  revokeApproverKey(
    approverId: string,
    keyId: string,
    by: Person,
    reason: string,
  ): ApproverKeyRecord {
    const id = approverKeyId(approverId, keyId);
    const key = this.requireApproverKey(id);
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "parmana-owner",
      "revoke an approver key",
    );
    if (!isNonEmpty(reason))
      throw new RegisterError("A revocation needs a reason.");
    const updated: ApproverKeyRecord = { ...key, status: "revoked" };
    this.approverKeys.set(id, updated);
    this.record(by.id, "approver-key.revoked", `${id}: ${reason}`);
    return updated;
  }

  /** Revokes a source at once. Its answers stop being used for new decisions (design 3). */
  revokeSource(name: string, by: Person, reason: string): SourceRecord {
    const source = this.requireSource(name);
    if (!hasRole(by, "parmana-owner") && !hasRole(by, "source-owner")) {
      throw new RegisterError(
        "Only the Parmana owner or the source owner may revoke a source.",
      );
    }
    if (!isNonEmpty(reason))
      throw new RegisterError("A revocation needs a reason.");
    const updated: SourceRecord = { ...source, status: "untrusted" };
    this.sources.set(name, updated);
    this.record(by.id, "source.revoked", `${name}: ${reason}`);
    return updated;
  }

  // ---- Thresholds ----------------------------------------------------------

  /** Proposes a threshold. The action owner proposes it, with a reason and evidence. */
  proposeThreshold(input: ThresholdInput, by: Person): ThresholdRecord {
    refusePlaceholders(input, "threshold");
    requireRole(by, "action-owner", "propose a threshold");
    if (by.id !== input.owner)
      throw new RegisterError(
        "The threshold owner must be the person proposing it.",
      );
    if (!isNonEmpty(input.reason) || !isNonEmpty(input.evidence)) {
      throw new RegisterError("A threshold needs a reason and evidence.");
    }
    if (!this.actions.has(input.action))
      throw new RegisterError(`Action "${input.action}" is not registered.`);
    const key = `${input.action}/${input.name}`;
    if (this.thresholds.has(key))
      throw new RegisterError(
        `Threshold "${key}" already exists. Propose a change instead.`,
      );
    const record: ThresholdRecord = {
      ...input,
      status: "proposed",
      proposedBy: by.id,
      approvals: [],
    };
    this.thresholds.set(key, record);
    this.record(
      by.id,
      "threshold.proposed",
      `${key} = ${input.value} ${input.unit}`,
    );
    return record;
  }

  /** Approves a threshold. A second person approves, and the risk function too if it is high-value. */
  approveThreshold(action: string, name: string, by: Person): ThresholdRecord {
    const key = `${action}/${name}`;
    const threshold = this.thresholds.get(key);
    if (threshold === undefined)
      throw new RegisterError(`Threshold "${key}" does not exist.`);
    if (threshold.status !== "proposed")
      throw new RegisterError(
        `Threshold "${key}" is already ${threshold.status}.`,
      );
    if (by.id === threshold.proposedBy)
      throw new RegisterError("A person cannot approve their own threshold.");
    const role: Role =
      hasRole(by, "risk-function") && threshold.highValue
        ? "risk-function"
        : "second-approver";
    if (role === "second-approver" && !hasRole(by, "second-approver")) {
      throw new RegisterError(
        "Only a second approver (or, for a high-value threshold, the risk function) may approve.",
      );
    }
    const approvals = [
      ...threshold.approvals,
      { by: by.id, role, at: this.timestamp() },
    ];
    const needsRisk = threshold.highValue;
    const haveSecond = approvals.some((a) => a.role === "second-approver");
    const haveRisk = approvals.some((a) => a.role === "risk-function");
    const status =
      haveSecond && (!needsRisk || haveRisk) ? "approved" : "proposed";
    const updated: ThresholdRecord = { ...threshold, approvals, status };
    this.thresholds.set(key, updated);
    this.record(
      by.id,
      "threshold.approved",
      `${key} as ${role}; status ${status}`,
    );
    return updated;
  }

  // ---- Actions -------------------------------------------------------------

  /** Registers an action. It is not live until the go-live gate passes. */
  registerAction(input: ActionInput, by: Person): ActionRecord {
    refusePlaceholders(input, "action");
    requireRole(by, "parmana-owner", "register an action");
    if (!CAPABILITY.test(input.capability))
      throw new RegisterError(
        'The capability must have the form "<system>:<action>".',
      );
    if (this.actions.has(input.capability))
      throw new RegisterError(`Action "${input.capability}" already exists.`);
    if (input.successor === input.owner)
      throw new RegisterError(
        "The successor must be a different person from the owner.",
      );
    if (
      input.review.reviewWindowBusinessDays > MAX_REVIEW_WINDOW_BUSINESS_DAYS
    ) {
      throw new RegisterError(
        `The review window may be at most ${MAX_REVIEW_WINDOW_BUSINESS_DAYS} business days.`,
      );
    }
    if (input.review.approvalValidityMinutes > MAX_APPROVAL_VALIDITY_MINUTES) {
      throw new RegisterError(
        `The approval validity may be at most ${MAX_APPROVAL_VALIDITY_MINUTES} minutes.`,
      );
    }
    const record: ActionRecord = { ...input, live: false, testedTiers: [] };
    this.actions.set(input.capability, record);
    this.record(by.id, "action.registered", input.capability);
    return record;
  }

  /** Records that a tier was tested for an action. The gate needs every tier it uses. */
  recordTest(capability: string, tier: string, by: Person): ActionRecord {
    const action = this.requireAction(capability);
    requireRole(by, "gate-owner", "record a test");
    const updated: ActionRecord = {
      ...action,
      testedTiers: [...new Set([...action.testedTiers, tier])],
    };
    this.actions.set(capability, updated);
    this.record(by.id, "action.tested", `${capability} ${tier}`);
    return updated;
  }

  /**
   * The go-live checklist, read only (design 5.7). Lists every item that is missing,
   * without running the gate. The console shows this to the gate owner.
   */
  gateMissing(
    capability: string,
    usedSources: readonly string[],
    usedThresholds: readonly string[],
    usedTiers: readonly string[] = [],
  ): string[] {
    const action = this.requireAction(capability);
    const missing: string[] = [];
    if (!isNonEmpty(action.owner)) missing.push("owner");
    if (!isNonEmpty(action.successor)) missing.push("successor");
    const eligible = new Set(
      action.reviewers.filter(
        (id) => id !== action.owner && id !== action.successor,
      ),
    );
    if (eligible.size < 2) missing.push("at least two eligible reviewers");
    for (const name of usedSources) {
      const source = this.sources.get(name);
      if (source === undefined)
        missing.push(`source "${name}" is not registered`);
      else if (source.status !== "trusted")
        missing.push(`source "${name}" is ${source.status}`);
    }
    for (const name of usedThresholds) {
      const threshold = this.thresholds.get(`${capability}/${name}`);
      if (threshold === undefined)
        missing.push(`threshold "${name}" is not registered`);
      else if (threshold.status !== "approved")
        missing.push(`threshold "${name}" is ${threshold.status}`);
    }
    if (action.testedTiers.length === 0)
      missing.push("a test run for each tier");
    for (const tier of usedTiers) {
      if (!action.testedTiers.includes(tier))
        missing.push(`a test run for tier "${tier}"`);
    }
    return missing;
  }

  /**
   * The go-live gate (design 5.7). Returns every item that is missing. The action
   * goes live only when none are missing.
   */
  /**
   * Runs the go-live gate (design 5.7) against the approved policy version. The sources,
   * thresholds and tiers come from that version, never from the caller. Only the gate owner
   * runs it. The action goes live only when nothing is missing.
   */
  runGoLive(
    capability: string,
    by: Person,
  ): { ok: boolean; missing: string[] } {
    requireRole(
      { id: by.id, roles: this.rolesOf(by.id) },
      "gate-owner",
      "run the go-live gate",
    );
    const approved = this.approvedVersion(capability);
    if (approved === undefined)
      throw new RegisterError(
        `${capability} has no approved policy version to go live with.`,
      );
    const used = usesOf(approved.policy);
    const missing = this.gateMissing(
      capability,
      used.sources,
      used.thresholds,
      used.tiers,
    );
    const action = this.requireAction(capability);
    if (missing.length === 0) {
      this.actions.set(capability, { ...action, live: true });
      this.record(by.id, "action.live", capability);
    }
    return { ok: missing.length === 0, missing };
  }

  /** The go-live checklist for the approved policy version, read only. */
  goLiveChecklist(capability: string): string[] {
    const approved = this.approvedVersion(capability);
    if (approved === undefined) return ["an approved policy version"];
    const used = usesOf(approved.policy);
    return this.gateMissing(
      capability,
      used.sources,
      used.thresholds,
      used.tiers,
    );
  }

  // ---- Reading -------------------------------------------------------------

  /** The register in the form validatePolicyV2 checks against. Only trusted sources are marked trusted. */
  toValidationRegister(): ValidationRegister {
    const sources: Record<string, ValidationRegister["sources"][string]> = {};
    for (const source of this.sources.values()) {
      sources[source.name] = {
        status:
          source.status === "trusted"
            ? "trusted"
            : source.status === "retired"
              ? "retired"
              : "untrusted",
        signer: {
          kind: source.signer.kind,
          ...(source.signer.operator !== undefined && {
            operator: source.signer.operator,
          }),
          ...(source.signer.reviewDate !== undefined && {
            reviewDate: source.signer.reviewDate,
          }),
        },
        claims: source.claims,
      };
    }
    return { sources };
  }

  /**
   * The key the verifier uses for an answer. Undefined if the source is unknown,
   * not yet approved, or the key id is not the registered one. "revoked" if the
   * source has been revoked or retired.
   */
  keyFor(source: string, keyId: string): KeyObject | "revoked" | undefined {
    const record = this.sources.get(source);
    if (record === undefined || record.keyId !== keyId) return undefined;
    if (record.status === "untrusted" || record.status === "retired")
      return "revoked";
    if (record.status === "pending") return undefined;
    return readEd25519PublicKey(record.publicKeyPem);
  }

  /** The whole register as plain data, for storage. */
  snapshot(): RegisterSnapshot {
    return {
      sources: [...this.sources.values()],
      thresholds: [...this.thresholds.values()],
      actions: [...this.actions.values()],
      policyVersions: [...this.policyVersions.values()].sort((a, b) =>
        policyVersionId(a.capability, a.policyVersion).localeCompare(
          policyVersionId(b.capability, b.policyVersion),
        ),
      ),
      approverKeys: [...this.approverKeys.values()].sort((a, b) =>
        approverKeyId(a.approverId, a.keyId).localeCompare(
          approverKeyId(b.approverId, b.keyId),
        ),
      ),
      roles: [...this.roles.entries()]
        .flatMap(([callerId, held]) =>
          [...held].map((role) => ({ callerId, role })),
        )
        .sort((a, b) =>
          a.callerId === b.callerId
            ? a.role.localeCompare(b.role)
            : a.callerId.localeCompare(b.callerId),
        ),
    };
  }

  /** Replaces the register's contents with a snapshot taken earlier. */
  load(snapshot: RegisterSnapshot): void {
    this.sources.clear();
    this.thresholds.clear();
    this.actions.clear();
    this.roles.clear();
    this.log.length = 0;
    this.pending = [];
    for (const s of snapshot.sources) this.sources.set(s.name, s);
    for (const t of snapshot.thresholds)
      this.thresholds.set(`${t.action}/${t.name}`, t);
    for (const a of snapshot.actions) this.actions.set(a.capability, a);
    for (const grant of snapshot.roles)
      this.addRole(grant.callerId, grant.role);
    this.approverKeys.clear();
    for (const key of snapshot.approverKeys ?? [])
      this.approverKeys.set(approverKeyId(key.approverId, key.keyId), key);
    this.policyVersions.clear();
    for (const version of snapshot.policyVersions ?? [])
      this.policyVersions.set(
        policyVersionId(version.capability, version.policyVersion),
        version,
      );
  }

  listApproverKeys(): readonly ApproverKeyRecord[] {
    return [...this.approverKeys.values()];
  }

  getApproverKey(
    approverId: string,
    keyId: string,
  ): ApproverKeyRecord | undefined {
    return this.approverKeys.get(approverKeyId(approverId, keyId));
  }

  private requireApproverKey(id: string): ApproverKeyRecord {
    const key = this.approverKeys.get(id);
    if (key === undefined)
      throw new RegisterError(`Approver key ${id} is not registered.`);
    return key;
  }

  listSources(): readonly SourceRecord[] {
    return [...this.sources.values()];
  }

  listThresholds(): readonly ThresholdRecord[] {
    return [...this.thresholds.values()];
  }

  listActions(): readonly ActionRecord[] {
    return [...this.actions.values()];
  }

  getSource(name: string): SourceRecord | undefined {
    return this.sources.get(name);
  }

  getThreshold(action: string, name: string): ThresholdRecord | undefined {
    return this.thresholds.get(`${action}/${name}`);
  }

  getAction(capability: string): ActionRecord | undefined {
    return this.actions.get(capability);
  }

  /** The audit log, oldest first. It is never edited. */
  auditLog(): readonly AuditEvent[] {
    return [...this.log];
  }

  // ---- Internals -----------------------------------------------------------

  private nextSourceRole(source: SourceRecord, by: Person): Role {
    const needsOwner =
      source.canApprove || source.signer.kind === "intermediary";
    const haveSecond = source.approvals.some(
      (a) => a.role === "second-approver",
    );
    if (!haveSecond) {
      if (!hasRole(by, "second-approver"))
        throw new RegisterError(
          "A second approver must approve this source first.",
        );
      return "second-approver";
    }
    if (
      needsOwner &&
      !source.approvals.some((a) => a.role === "parmana-owner")
    ) {
      if (!hasRole(by, "parmana-owner")) {
        throw new RegisterError(
          "This source can approve or uses an intermediary, so the Parmana owner must sign off.",
        );
      }
      return "parmana-owner";
    }
    throw new RegisterError("This source already has every approval it needs.");
  }

  private requireSource(name: string): SourceRecord {
    const source = this.sources.get(name);
    if (source === undefined)
      throw new RegisterError(`Source "${name}" is not registered.`);
    return source;
  }

  private requireAction(capability: string): ActionRecord {
    const action = this.actions.get(capability);
    if (action === undefined)
      throw new RegisterError(`Action "${capability}" is not registered.`);
    return action;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private record(by: string, event: string, detail: string): void {
    const entry = { at: this.timestamp(), by, event, detail };
    this.log.push(entry);
    this.pending.push(entry);
  }
}

function requireRole(person: Person, role: Role, action: string): void {
  if (!hasRole(person, role)) {
    throw new RegisterError(
      `${person.id} may not ${action}: the ${role} role is needed.`,
    );
  }
}

function approverKeyId(approverId: string, keyId: string): string {
  return `${approverId}/${keyId}`;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function policyVersionId(capability: string, policyVersion: string): string {
  return `${capability}@${policyVersion}`;
}

function hashOf(policy: unknown): string {
  return createHash("sha256").update(canonicalize(policy)).digest("hex");
}

/** The sources, thresholds and tiers a policy uses. The go-live gate checks each of them. */
function usesOf(policy: unknown): {
  sources: string[];
  thresholds: string[];
  tiers: string[];
} {
  const body = policy as {
    signals?: Record<string, { source?: unknown }>;
    thresholds?: Record<string, unknown>;
    rules?: Array<{ tier?: unknown }>;
  };
  return {
    sources: Object.values(body.signals ?? {})
      .map((signal) => signal.source)
      .filter(isNonEmpty),
    thresholds: Object.keys(body.thresholds ?? {}),
    tiers: [
      ...new Set(
        (body.rules ?? []).map((rule) => rule.tier).filter(isNonEmpty),
      ),
    ],
  };
}
