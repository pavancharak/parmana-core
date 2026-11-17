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

import type { KeyObject } from "node:crypto";

import type { ValidationRegister } from "./validatePolicyV2.js";
import { readEd25519PublicKey } from "./sourceAnswer.js";

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

/** The register's contents as plain data. */
export interface RegisterSnapshot {
  readonly sources: readonly SourceRecord[];
  readonly thresholds: readonly ThresholdRecord[];
  readonly actions: readonly ActionRecord[];
  readonly log: readonly AuditEvent[];
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
  private readonly log: AuditEvent[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

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
    return missing;
  }

  /**
   * The go-live gate (design 5.7). Returns every item that is missing. The action
   * goes live only when none are missing.
   */
  goLive(
    capability: string,
    usedSources: readonly string[],
    usedThresholds: readonly string[],
    by: Person,
  ): { ok: boolean; missing: string[] } {
    requireRole(by, "gate-owner", "run the go-live gate");
    const missing = this.gateMissing(capability, usedSources, usedThresholds);
    const action = this.requireAction(capability);
    if (missing.length === 0) {
      this.actions.set(capability, { ...action, live: true });
      this.record(by.id, "action.live", capability);
    }
    return { ok: missing.length === 0, missing };
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
      log: [...this.log],
    };
  }

  /** Replaces the register's contents with a snapshot taken earlier. */
  load(snapshot: RegisterSnapshot): void {
    this.sources.clear();
    this.thresholds.clear();
    this.actions.clear();
    this.log.length = 0;
    for (const s of snapshot.sources) this.sources.set(s.name, s);
    for (const t of snapshot.thresholds)
      this.thresholds.set(`${t.action}/${t.name}`, t);
    for (const a of snapshot.actions) this.actions.set(a.capability, a);
    this.log.push(...snapshot.log);
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
    this.log.push({ at: this.timestamp(), by, event, detail });
  }
}

function requireRole(person: Person, role: Role, action: string): void {
  if (!hasRole(person, role)) {
    throw new RegisterError(
      `${person.id} may not ${action}: the ${role} role is needed.`,
    );
  }
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
