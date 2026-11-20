/**
 * The decision flow for policy schema version 2 (design 4.4).
 *
 * Order, as the design sets it:
 *   1. the approved policy for the capability, checked by the validator;
 *   2. the sourced values, asked of their registered sources and verified;
 *   3. the caller's proposed values, compared with the sourced values;
 *   4. the approvals, verified for the exact value;
 *   5. the tiers, in order: the first matching rule decides;
 *   6. the decision record.
 *
 * Used by the runtime. Every refusal names its cause.
 */

import { createHash } from "node:crypto";

import type { KeyObject } from "node:crypto";

import type { ValidationRegister } from "./validatePolicyV2.js";
import {
  canonicalize,
  verifySourceAnswer,
  type NonceStore,
  type SignedAnswer,
} from "./sourceAnswer.js";
import {
  validatePolicyV2,
  type Provenance,
  type ValidationError,
} from "./validatePolicyV2.js";

export type Outcome = "APPROVE" | "REJECT" | "REVIEW";

/** Refusals that happen before any rule runs. Each refuses the request. */
export type RefusalCode =
  | "NO_APPROVED_POLICY"
  | "ACTION_NOT_LIVE"
  | "POLICY_INVALID"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_NOT_VERIFIED"
  | "STALE"
  | "INVALID"
  | "MISSING_VALUE"
  | "THRESHOLD_NOT_APPROVED";

export interface Refusal {
  readonly code: RefusalCode;
  readonly detail: string;
  readonly errors?: readonly ValidationError[];
}

export interface DecisionValue {
  readonly value: string | number | boolean;
  readonly provenance: Provenance;
}

/** What the register must answer for a decision: keys, thresholds and the validator's view. */
export interface DecisionRegister {
  keyFor(source: string, keyId: string): KeyObject | "revoked" | undefined;
  getThreshold(
    capability: string,
    name: string,
  ):
    | { readonly status: string; readonly value: number; readonly unit: string }
    | undefined;
  toValidationRegister(): ValidationRegister;
}

/** The signed inputs a decision used. They are stored with the decision so it can be replayed. */
export interface DecisionInputs {
  /** The signed answer for each sourced signal. */
  readonly answers: Readonly<Record<string, SignedAnswer>>;
  /** The approval artifact for each approval signal, as presented. */
  readonly approvals: Readonly<Record<string, unknown>>;
}

export interface CoreDecision {
  readonly outcome: Outcome;
  readonly reason: string;
  readonly refusal?: Refusal;
  readonly matchedRuleId?: string;
  readonly tier?: string;
  readonly policy: { readonly capability: string; readonly hash: string };
  readonly values: Readonly<Record<string, DecisionValue>>;
}

export interface Decision extends CoreDecision {
  readonly inputs: DecisionInputs;
}

/** The request as the caller sends it. Its signals are untrusted; its approvals are checked. */
export interface DecisionRequest {
  readonly capability: string;
  readonly transactionId: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Caller values, by signal name. Untrusted. */
  readonly signals: Readonly<Record<string, unknown>>;
  /** Approval artifacts, by approval signal name. Checked by the approval checker. */
  readonly approvals?: Readonly<Record<string, unknown>>;
}

/** An approved policy version for a capability, as the policy repository holds it. */
export interface ApprovedPolicy {
  readonly policy: unknown;
}

/** Asks a registered source for one answer. It may throw if the source is down. */
export type SourceClient = (query: {
  readonly source: string;
  readonly claim: string;
  readonly subject: string;
  readonly action: string;
  readonly transactionId: string;
}) => Promise<unknown>;

/** Verifies an approval artifact for the exact value it must match. */
export type ApprovalChecker = (
  signal: string,
  artifact: unknown,
  expected: {
    readonly resource: string;
    readonly value: string | number | boolean;
    readonly action: string;
    readonly transactionId: string;
    readonly now: Date;
  },
) => Promise<boolean>;

export interface DecisionDeps {
  readonly policies: (capability: string) => ApprovedPolicy | undefined;
  /**
   * True when a version is approved for the capability but its action has not passed the
   * go-live gate. Used only to say why no policy is in force; it never allows a decision.
   */
  readonly approvedButNotLive?: (capability: string) => boolean;
  readonly register: DecisionRegister;
  readonly sources: SourceClient;
  readonly nonces: NonceStore;
  readonly approvals: ApprovalChecker;
  readonly now: () => Date;
}

interface PolicyShape {
  readonly signals: Record<
    string,
    {
      type: string;
      provenance: Provenance;
      source?: string;
      claim?: string;
      subject?: string;
      maxAgeSeconds?: number;
      values?: string[];
      approvalFor?: { value: string };
    }
  >;
  readonly thresholds?: Record<string, { value: number; unit: string }>;
  readonly rules: {
    id: string;
    tier: string;
    when: unknown;
    outcome: { action: string; reason: string };
  }[];
}

function refuse(
  policy: { capability: string; hash: string },
  code: RefusalCode,
  detail: string,
  errors?: readonly ValidationError[],
  values: Record<string, DecisionValue> = {},
): CoreDecision {
  return {
    outcome: "REJECT",
    reason: `Refused: ${detail}`,
    refusal: { code, detail, ...(errors !== undefined && { errors }) },
    policy,
    values,
  };
}

function hashOf(policy: unknown): string {
  return createHash("sha256").update(canonicalize(policy)).digest("hex");
}

/** Resolves a subject path: "target" or "parameters.<name>". */
function resolveSubject(
  path: string,
  request: DecisionRequest,
): string | undefined {
  if (path === "target") return request.target;
  if (path.startsWith("parameters.")) {
    const value = request.parameters[path.slice("parameters.".length)];
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined;
  }
  return undefined;
}

function typeMatches(type: string, value: unknown): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number";
  if (type === "string" || type === "enum") return typeof value === "string";
  return false;
}

/** Evaluates one condition. Every value it reads has already been checked to be present. */
function holds(
  condition: unknown,
  values: Record<string, DecisionValue>,
  thresholds: Record<string, number>,
): boolean {
  if (typeof condition !== "object" || condition === null) return false;
  const c = condition as Record<string, unknown>;
  if (c["always"] === true) return true;
  if (Array.isArray(c["all"]))
    return c["all"].every((child) => holds(child, values, thresholds));
  if (Array.isArray(c["any"]))
    return c["any"].some((child) => holds(child, values, thresholds));
  const fact = c["fact"];
  if (typeof fact !== "string") return false;
  const actual = values[fact]?.value;
  const operator = c["operator"];
  const raw = c["value"];
  const rhs: unknown =
    typeof raw === "object" && raw !== null && "threshold" in raw
      ? thresholds[String((raw as { threshold: unknown }).threshold)]
      : raw;
  switch (operator) {
    case "is_true":
      return actual === true;
    case "is_false":
      return actual === false;
    case "is_null":
      return actual === undefined || actual === null;
    case "is_not_null":
      return actual !== undefined && actual !== null;
    case "eq":
      return actual === rhs;
    case "neq":
      return actual !== rhs;
    case "in":
      return Array.isArray(rhs) && rhs.includes(actual);
    case "gt":
      return (
        typeof actual === "number" && typeof rhs === "number" && actual > rhs
      );
    case "gte":
      return (
        typeof actual === "number" && typeof rhs === "number" && actual >= rhs
      );
    case "lt":
      return (
        typeof actual === "number" && typeof rhs === "number" && actual < rhs
      );
    case "lte":
      return (
        typeof actual === "number" && typeof rhs === "number" && actual <= rhs
      );
    default:
      return false;
  }
}

function factsOf(condition: unknown, out: Set<string>): void {
  if (typeof condition !== "object" || condition === null) return;
  const c = condition as Record<string, unknown>;
  if (typeof c["fact"] === "string") out.add(c["fact"]);
  for (const key of ["all", "any"]) {
    if (Array.isArray(c[key])) c[key].forEach((child) => factsOf(child, out));
  }
}

function thresholdsOf(condition: unknown, out: Set<string>): void {
  if (typeof condition !== "object" || condition === null) return;
  const c = condition as Record<string, unknown>;
  const raw = c["value"];
  if (typeof raw === "object" && raw !== null && "threshold" in raw) {
    out.add(String((raw as { threshold: unknown }).threshold));
  }
  for (const key of ["all", "any"]) {
    if (Array.isArray(c[key]))
      c[key].forEach((child) => thresholdsOf(child, out));
  }
}

/** Signals in name order, so every run walks them the same way, whatever order the policy's keys were written in. */
function sortedSignals(
  policy: PolicyShape,
): [string, PolicyShape["signals"][string]][] {
  return Object.entries(policy.signals).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
}

/** Decides one request. Returns a decision, which is recorded whatever the outcome, with the signed inputs it used. */
export async function decide(
  request: DecisionRequest,
  deps: DecisionDeps,
): Promise<Decision> {
  const inputs: {
    answers: Record<string, SignedAnswer>;
    approvals: Record<string, unknown>;
  } = { answers: {}, approvals: {} };
  const core = await decideCore(request, deps, inputs);
  return {
    ...core,
    inputs: {
      answers: { ...inputs.answers },
      approvals: { ...inputs.approvals },
    },
  };
}

async function decideCore(
  request: DecisionRequest,
  deps: DecisionDeps,
  inputs: {
    answers: Record<string, SignedAnswer>;
    approvals: Record<string, unknown>;
  },
): Promise<CoreDecision> {
  const now = deps.now();
  const approved = deps.policies(request.capability);
  const bare = { capability: request.capability, hash: "" };
  if (approved === undefined) {
    if (deps.approvedButNotLive?.(request.capability) === true)
      return refuse(
        bare,
        "ACTION_NOT_LIVE",
        `A policy version is approved for "${request.capability}", but its action is not live: the go-live gate has not passed, so no decision is made.`,
      );
    return refuse(
      bare,
      "NO_APPROVED_POLICY",
      `No approved policy is in force for "${request.capability}".`,
    );
  }

  const hash = hashOf(approved.policy);
  const policyRef = { capability: request.capability, hash };
  const validation = validatePolicyV2(
    approved.policy,
    deps.register.toValidationRegister(),
  );
  if (!validation.ok) {
    return refuse(
      policyRef,
      "POLICY_INVALID",
      "The policy in force does not pass the validator.",
      validation.errors,
    );
  }
  const policy = approved.policy as PolicyShape;

  // 2. Sourced values: ask, verify, check freshness and agreement.
  const values: Record<string, DecisionValue> = {};
  for (const [name, decl] of sortedSignals(policy)) {
    if (decl.provenance !== "sourced") continue;
    const subject = resolveSubject(decl.subject ?? "", request);
    if (subject === undefined)
      return refuse(
        policyRef,
        "MISSING_VALUE",
        `The request has no subject for "${name}".`,
        undefined,
        values,
      );
    let answer: unknown;
    try {
      answer = await deps.sources({
        source: decl.source ?? "",
        claim: decl.claim ?? "",
        subject,
        action: request.capability,
        transactionId: request.transactionId,
      });
    } catch {
      return refuse(
        policyRef,
        "SOURCE_UNAVAILABLE",
        `Source "${decl.source}" did not answer for "${name}".`,
        undefined,
        values,
      );
    }
    const verified = await verifySourceAnswer(
      answer,
      {
        source: decl.source ?? "",
        claim: decl.claim ?? "",
        subject,
        action: request.capability,
        transactionId: request.transactionId,
      },
      {
        keyFor: (s, k) => deps.register.keyFor(s, k),
        nonces: deps.nonces,
        now,
      },
    );
    if (!verified.ok) {
      return refuse(
        policyRef,
        "SOURCE_NOT_VERIFIED",
        `"${name}" was not verified: ${verified.reason}`,
        undefined,
        values,
      );
    }
    const signed = answer as SignedAnswer;
    inputs.answers[name] = signed;
    const observed = Date.parse(signed.payload.observedAt);
    if (
      decl.maxAgeSeconds !== undefined &&
      now.getTime() - observed > decl.maxAgeSeconds * 1000
    ) {
      return refuse(
        policyRef,
        "STALE",
        `The answer for "${name}" is older than ${decl.maxAgeSeconds} seconds.`,
        undefined,
        values,
      );
    }
    if (!typeMatches(decl.type, verified.value)) {
      return refuse(
        policyRef,
        "SOURCE_NOT_VERIFIED",
        `The answer for "${name}" has the wrong type.`,
        undefined,
        values,
      );
    }
    // 3. The caller's proposed value must agree with the source.
    const proposed = request.signals[name];
    if (proposed !== undefined && proposed !== verified.value) {
      return refuse(
        policyRef,
        "INVALID",
        `The caller proposed ${JSON.stringify(proposed)} for "${name}", but the source reports ${JSON.stringify(verified.value)}.`,
        undefined,
        values,
      );
    }
    values[name] = { value: verified.value, provenance: "sourced" };
  }

  // Untrusted and AI values come from the caller. An AI value must be in its closed set.
  for (const [name, decl] of sortedSignals(policy)) {
    if (decl.provenance !== "untrusted" && decl.provenance !== "ai") continue;
    const value = request.signals[name];
    if (value === undefined)
      return refuse(
        policyRef,
        "MISSING_VALUE",
        `"${name}" was not sent.`,
        undefined,
        values,
      );
    if (
      decl.provenance === "ai" &&
      !(decl.values ?? []).includes(String(value))
    ) {
      return refuse(
        policyRef,
        "MISSING_VALUE",
        `"${name}" is not one of its allowed values.`,
        undefined,
        values,
      );
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return refuse(
        policyRef,
        "MISSING_VALUE",
        `"${name}" must be a string, number or boolean.`,
        undefined,
        values,
      );
    }
    values[name] = { value, provenance: decl.provenance };
  }

  // 4. Approvals: verified for the exact value they name. A missing or failed approval is false.
  for (const [name, decl] of sortedSignals(policy)) {
    if (decl.provenance !== "approved") continue;
    const target = decl.approvalFor?.value;
    const expectedValue =
      target !== undefined ? values[target]?.value : undefined;
    const artifact = request.approvals?.[name];
    if (artifact !== undefined) inputs.approvals[name] = artifact;
    let verified = false;
    if (artifact !== undefined && expectedValue !== undefined) {
      verified = await deps.approvals(target ?? name, artifact, {
        resource: request.target,
        value: expectedValue,
        action: request.capability,
        transactionId: request.transactionId,
        now,
      });
    }
    values[name] = { value: verified, provenance: "approved" };
  }

  // The values every rule reads must be present.
  const readFacts = new Set<string>();
  const readThresholds = new Set<string>();
  for (const rule of policy.rules) {
    factsOf(rule.when, readFacts);
    thresholdsOf(rule.when, readThresholds);
  }
  for (const fact of readFacts) {
    if (values[fact] === undefined)
      return refuse(
        policyRef,
        "MISSING_VALUE",
        `"${fact}" is needed by a rule and is missing.`,
        undefined,
        values,
      );
  }

  // Thresholds: each must be approved in the register and match the policy's value and unit.
  const thresholdValues: Record<string, number> = {};
  for (const name of readThresholds) {
    const declared = policy.thresholds?.[name];
    const registered = deps.register.getThreshold(request.capability, name);
    if (
      declared === undefined ||
      registered === undefined ||
      registered.status !== "approved" ||
      registered.value !== declared.value ||
      registered.unit !== declared.unit
    ) {
      return refuse(
        policyRef,
        "THRESHOLD_NOT_APPROVED",
        `Threshold "${name}" is not approved in the register at the value the policy states.`,
        undefined,
        values,
      );
    }
    thresholdValues[name] = declared.value;
  }

  // 5. The tiers, in order. The first matching rule decides.
  for (const rule of policy.rules) {
    if (!holds(rule.when, values, thresholdValues)) continue;
    const outcome: Outcome =
      rule.outcome.action === "approve"
        ? "APPROVE"
        : rule.outcome.action === "review"
          ? "REVIEW"
          : "REJECT";
    return {
      outcome,
      reason: rule.outcome.reason,
      matchedRuleId: rule.id,
      tier: rule.tier,
      policy: policyRef,
      values,
    };
  }
  return {
    outcome: "REJECT",
    reason: "No rule matched.",
    policy: policyRef,
    values,
  };
}
