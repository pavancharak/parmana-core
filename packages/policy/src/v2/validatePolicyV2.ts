/**
 * Validator for policy schema version 2.
 *
 * Specification: docs/internal/design/POLICY-V2-SPEC.md, section 7.
 *
 * The register calls this when a policy is proposed and when it is approved. It returns every error it
 * finds, each tagged with the check number from the specification, so a
 * policy can be refused at load time and at proposal time.
 */

export type Provenance = "sourced" | "approved" | "ai" | "untrusted";
export type Tier = "refuse" | "review" | "tier1" | "tier2" | "reject";

/** What the register says about one source. Built from the register, not from the policy. */
export interface RegisterSource {
  readonly status: "trusted" | "untrusted" | "retired";
  readonly signer: {
    readonly kind: "system" | "intermediary";
    readonly operator?: string;
    readonly reviewDate?: string;
  };
  /** Claim name to the unit the source states for it. */
  readonly claims: Readonly<Record<string, string>>;
}

export interface ValidationRegister {
  readonly sources: Readonly<Record<string, RegisterSource>>;
}

export interface ValidationError {
  /** The check number in POLICY-V2-SPEC.md section 7. 0 means structure. */
  readonly check: number;
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ValidationError[];
}

const TIER_ORDER: Readonly<Record<string, number>> = {
  refuse: 1,
  review: 2,
  tier1: 3,
  tier2: 4,
  reject: 5,
};

const SIGNAL_TYPES = new Set([
  "boolean",
  "number",
  "string",
  "enum",
  "approval",
]);
const PROVENANCES = new Set<string>(["sourced", "approved", "ai", "untrusted"]);
const OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is_true",
  "is_false",
  "is_null",
  "is_not_null",
]);
const PLACEHOLDER = /<[^<>]+>/;
const CAPABILITY = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/** Review settings caps (plan 4.6, decision D11). */
const MAX_REVIEW_WINDOW_BUSINESS_DAYS = 3;
const MAX_APPROVAL_VALIDITY_MINUTES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Walks every string in a value and reports any placeholder (check 20). */
function scanPlaceholders(
  value: unknown,
  path: string,
  report: (path: string, text: string) => void,
): void {
  if (typeof value === "string") {
    if (PLACEHOLDER.test(value)) report(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanPlaceholders(item, `${path}[${index}]`, report),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      scanPlaceholders(item, `${path}.${key}`, report);
    }
  }
}

interface Leaf {
  readonly fact?: unknown;
  readonly operator?: unknown;
  readonly value?: unknown;
  readonly path: string;
}

/** Every leaf condition in a rule's condition tree, with its path. */
function collectLeaves(condition: unknown, path: string, out: Leaf[]): void {
  if (!isRecord(condition)) return;
  if ("fact" in condition) {
    out.push({
      fact: condition["fact"],
      operator: condition["operator"],
      value: condition["value"],
      path,
    });
    return;
  }
  if (Array.isArray(condition["all"])) {
    condition["all"].forEach((child, index) =>
      collectLeaves(child, `${path}.all[${index}]`, out),
    );
    return;
  }
  if (Array.isArray(condition["any"])) {
    condition["any"].forEach((child, index) =>
      collectLeaves(child, `${path}.any[${index}]`, out),
    );
  }
}

/**
 * Validates a version 2 policy against the register.
 *
 * @param policy the parsed policy document
 * @param register the sources and their claims, as registered
 */
export function validatePolicyV2(
  policy: unknown,
  register: ValidationRegister,
): ValidationResult {
  const errors: ValidationError[] = [];
  const thresholdUsedInTier1 = new Set<string>();
  const err = (check: number, path: string, message: string): void => {
    errors.push({ check, path, message });
  };

  if (!isRecord(policy)) {
    err(0, "$", "The policy must be an object.");
    return { ok: false, errors };
  }

  // Check 20: placeholders anywhere in the policy or the register.
  const reportPlaceholder = (path: string, text: string): void =>
    err(
      20,
      path,
      `Placeholder "${text}" must be replaced before the policy can be approved.`,
    );
  scanPlaceholders(policy, "policy", reportPlaceholder);
  scanPlaceholders(register, "register", reportPlaceholder);

  // Structure.
  for (const field of [
    "policyId",
    "policyVersion",
    "capability",
    "description",
    "owner",
  ]) {
    if (!isNonEmptyString(policy[field])) {
      err(0, field, `${field} is required and must be a non-empty string.`);
    }
  }
  if (policy["schemaVersion"] !== "2.0.0") {
    err(0, "schemaVersion", 'schemaVersion must be "2.0.0".');
  }

  // Check 2: capability form.
  if (
    isNonEmptyString(policy["capability"]) &&
    !CAPABILITY.test(policy["capability"])
  ) {
    err(2, "capability", 'capability must have the form "<system>:<action>".');
  }

  // Signals: declarations, provenance, and the register checks for sourced values.
  const signals = isRecord(policy["signals"]) ? policy["signals"] : undefined;
  if (signals === undefined) {
    err(0, "signals", "signals is required and must be an object.");
  }
  const declared = new Map<
    string,
    { provenance: string; unit?: string; type: string }
  >();
  const approvalValueRefs: { path: string; name: string }[] = [];
  for (const [name, raw] of Object.entries(signals ?? {})) {
    const path = `signals.${name}`;
    if (!isRecord(raw)) {
      err(0, path, "A signal declaration must be an object.");
      continue;
    }
    const type = raw["type"];
    const provenance = raw["provenance"];
    if (typeof type !== "string" || !SIGNAL_TYPES.has(type)) {
      err(
        0,
        `${path}.type`,
        "type must be boolean, number, string, enum or approval.",
      );
    }
    if (typeof provenance !== "string" || !PROVENANCES.has(provenance)) {
      err(
        0,
        `${path}.provenance`,
        "provenance must be sourced, approved, ai or untrusted.",
      );
    }
    const unit = isNonEmptyString(raw["unit"]) ? raw["unit"] : undefined;

    // Check 16: every number states its unit.
    if (type === "number" && unit === undefined) {
      err(16, `${path}.unit`, "A number must declare its unit.");
    }

    if (provenance === "sourced") {
      // Check 9: source, claim, subject and maxAgeSeconds are required.
      for (const field of ["source", "claim", "subject"]) {
        if (!isNonEmptyString(raw[field])) {
          err(9, `${path}.${field}`, `A sourced signal needs ${field}.`);
        }
      }
      if (!isPositiveNumber(raw["maxAgeSeconds"])) {
        err(
          9,
          `${path}.maxAgeSeconds`,
          "A sourced signal needs a positive maxAgeSeconds.",
        );
      }
      // Checks 9, 16, 17 and 19 against the register.
      if (isNonEmptyString(raw["source"])) {
        const source = register.sources[raw["source"]];
        if (source === undefined) {
          err(
            17,
            `${path}.source`,
            `Source "${raw["source"]}" is not registered.`,
          );
        } else {
          if (source.status !== "trusted") {
            err(
              9,
              `${path}.source`,
              `Source "${raw["source"]}" is ${source.status}, not trusted.`,
            );
          }
          if (source.signer.kind === "intermediary") {
            if (
              !isNonEmptyString(source.signer.operator) ||
              !isNonEmptyString(source.signer.reviewDate)
            ) {
              err(
                19,
                `${path}.source`,
                "An intermediary signer needs a named operator and a review date.",
              );
            }
          }
          if (isNonEmptyString(raw["claim"])) {
            const claimUnit = source.claims[raw["claim"]];
            if (claimUnit === undefined) {
              err(
                17,
                `${path}.claim`,
                `Claim "${raw["claim"]}" is not registered for source "${raw["source"]}".`,
              );
            } else if (
              type === "number" &&
              unit !== undefined &&
              unit !== claimUnit
            ) {
              err(
                16,
                `${path}.unit`,
                `Unit "${unit}" does not match the registered unit "${claimUnit}" of the claim.`,
              );
            }
          }
        }
      }
    }

    if (provenance === "approved") {
      // Check 8: approvalFor and exact scope.
      const approvalFor = raw["approvalFor"];
      if (
        !isRecord(approvalFor) ||
        !isNonEmptyString(approvalFor["resourceId"]) ||
        !isNonEmptyString(approvalFor["value"])
      ) {
        err(
          8,
          `${path}.approvalFor`,
          "An approved signal needs approvalFor with resourceId and value.",
        );
      } else {
        approvalValueRefs.push({
          path: `${path}.approvalFor.value`,
          name: approvalFor["value"],
        });
      }
      if (raw["scope"] !== "exact") {
        err(8, `${path}.scope`, 'An approved signal must use scope "exact".');
      }
    }

    if (provenance === "ai") {
      // Check 10: closed values and a permitted use that excludes approve.
      const values = raw["values"];
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        !values.every(isNonEmptyString)
      ) {
        err(
          10,
          `${path}.values`,
          "An AI signal needs a non-empty closed list of values.",
        );
      }
      const permitted = raw["permittedUse"];
      if (!Array.isArray(permitted) || permitted.length === 0) {
        err(10, `${path}.permittedUse`, "An AI signal needs a permittedUse.");
      } else {
        for (const use of permitted) {
          if (use !== "refuse" && use !== "review") {
            err(
              10,
              `${path}.permittedUse`,
              `permittedUse "${String(use)}" is not allowed; use refuse or review.`,
            );
          }
        }
      }
    }

    declared.set(name, {
      provenance: typeof provenance === "string" ? provenance : "",
      type: typeof type === "string" ? type : "",
      ...(unit !== undefined && { unit }),
    });
  }

  // Check 8: an approval's value must name a declared signal.
  for (const ref of approvalValueRefs) {
    if (!declared.has(ref.name)) {
      err(
        8,
        ref.path,
        `The approved value must name a declared signal; "${ref.name}" is not declared.`,
      );
    }
  }

  // Thresholds: named, with unit, owner, reason and review date (check 11).
  const thresholds = new Map<string, { unit?: string; approvedBy?: string }>();
  const rawThresholds = isRecord(policy["thresholds"])
    ? policy["thresholds"]
    : {};
  for (const [name, raw] of Object.entries(rawThresholds)) {
    const path = `thresholds.${name}`;
    if (!isRecord(raw)) {
      err(11, path, "A threshold must be an object.");
      continue;
    }
    if (typeof raw["value"] !== "number") {
      err(11, `${path}.value`, "A threshold value must be a number.");
    }
    for (const field of ["unit", "owner", "reason", "nextReview"]) {
      if (!isNonEmptyString(raw[field])) {
        err(11, `${path}.${field}`, `A threshold needs ${field}.`);
      }
    }
    const approvedBy = isNonEmptyString(raw["approvedBy"])
      ? raw["approvedBy"]
      : undefined;
    const unit = isNonEmptyString(raw["unit"]) ? raw["unit"] : undefined;
    thresholds.set(name, {
      ...(unit !== undefined && { unit }),
      ...(approvedBy !== undefined && { approvedBy }),
    });
  }

  // Review settings (check 18): required when the policy has review or tier2 rules.
  const rules = Array.isArray(policy["rules"]) ? policy["rules"] : undefined;
  if (rules === undefined || rules.length === 0) {
    err(0, "rules", "rules is required and must be a non-empty array.");
  }
  const review = policy["review"];
  const needsReview = (rules ?? []).some(
    (rule) =>
      isRecord(rule) && (rule["tier"] === "review" || rule["tier"] === "tier2"),
  );
  if (review === undefined) {
    if (needsReview)
      err(
        18,
        "review",
        "A policy with review or tier2 rules must declare review settings.",
      );
  } else if (!isRecord(review)) {
    err(18, "review", "review must be an object.");
  } else {
    const days = review["reviewWindowBusinessDays"];
    const minutes = review["approvalValidityMinutes"];
    if (!isPositiveNumber(days) || days > MAX_REVIEW_WINDOW_BUSINESS_DAYS) {
      err(
        18,
        "review.reviewWindowBusinessDays",
        `The review window must be at most ${MAX_REVIEW_WINDOW_BUSINESS_DAYS} business days.`,
      );
    }
    if (!isPositiveNumber(minutes) || minutes > MAX_APPROVAL_VALIDITY_MINUTES) {
      err(
        18,
        "review.approvalValidityMinutes",
        `The approval validity must be at most ${MAX_APPROVAL_VALIDITY_MINUTES} minutes.`,
      );
    }
  }

  // Rules.
  const tiersSeen: number[] = [];
  let rejectCount = 0;
  (rules ?? []).forEach((rule, index) => {
    const path = `rules[${index}]`;
    if (!isRecord(rule)) {
      err(0, path, "A rule must be an object.");
      return;
    }
    const tier = rule["tier"];
    if (typeof tier !== "string" || !(tier in TIER_ORDER)) {
      err(
        3,
        `${path}.tier`,
        "tier must be refuse, review, tier1, tier2 or reject.",
      );
      return;
    }
    tiersSeen.push(TIER_ORDER[tier] ?? 0);
    if (tier === "reject") {
      rejectCount += 1;
      if (
        index !== (rules ?? []).length - 1 ||
        rule["when"] === undefined ||
        !isRecord(rule["when"]) ||
        rule["when"]["always"] !== true
      ) {
        err(
          4,
          path,
          "The reject rule must be the last rule and must use when: always.",
        );
      }
    }

    // Outcome: a reason, and approve only in tier1 or tier2 (checks 7 and 13).
    const outcome = isRecord(rule["outcome"]) ? rule["outcome"] : undefined;
    if (outcome === undefined || !isNonEmptyString(outcome["reason"])) {
      err(13, `${path}.outcome.reason`, "Every rule needs a non-empty reason.");
    }
    const action = outcome?.["action"];
    if (action !== "approve" && action !== "reject" && action !== "review") {
      err(
        0,
        `${path}.outcome.action`,
        "action must be approve, reject or review.",
      );
    }
    if (action === "approve" && tier !== "tier1" && tier !== "tier2") {
      err(
        7,
        `${path}.outcome.action`,
        "Only tier1 and tier2 rules may approve.",
      );
    }

    // Conditions: facts, operators, and right-hand sides (checks 1, 14, 15, 16).
    const leaves: Leaf[] = [];
    collectLeaves(rule["when"], `${path}.when`, leaves);
    const factsRead = new Set<string>();
    for (const leaf of leaves) {
      const operator = leaf.operator;
      if (typeof operator !== "string" || !OPERATORS.has(operator)) {
        err(
          0,
          `${leaf.path}.operator`,
          `Operator "${String(operator)}" is not allowed.`,
        );
      }
      if (typeof leaf.fact !== "string" || !declared.has(leaf.fact)) {
        err(
          1,
          `${leaf.path}.fact`,
          `Fact "${String(leaf.fact)}" is not declared in signals.`,
        );
        continue;
      }
      factsRead.add(leaf.fact);
      const signal = declared.get(leaf.fact);
      const rhs = leaf.value;
      const values = Array.isArray(rhs) ? rhs : [rhs];
      for (const item of values) {
        if (isRecord(item) && "threshold" in item) {
          const name = item["threshold"];
          if (typeof name !== "string" || !thresholds.has(name)) {
            err(
              11,
              `${leaf.path}.value`,
              `Threshold "${String(name)}" is not declared.`,
            );
            continue;
          }
          const threshold = thresholds.get(name);
          if (
            signal?.unit !== undefined &&
            threshold?.unit !== undefined &&
            signal.unit !== threshold.unit
          ) {
            err(
              16,
              `${leaf.path}.value`,
              `Threshold "${name}" is in ${threshold.unit}, but "${leaf.fact}" is in ${signal.unit}.`,
            );
          }
          if (tier === "tier1" && name !== undefined) {
            thresholdUsedInTier1.add(name);
          }
        } else if (isRecord(item)) {
          // Check 14: the right-hand side is never another signal.
          err(
            14,
            `${leaf.path}.value`,
            "A rule may not compare one value with another; compare with a constant or a threshold.",
          );
        } else if (typeof item === "number" && item !== 0) {
          // Check 15: no literal numbers except zero.
          err(
            15,
            `${leaf.path}.value`,
            `The literal number ${item} must be a named threshold.`,
          );
        }
      }
    }

    // Tier rules on which facts a rule may read (checks 5 and 6).
    if (tier === "tier1") {
      for (const fact of factsRead) {
        if (declared.get(fact)?.provenance !== "sourced") {
          err(
            5,
            `${path}.when`,
            `Tier 1 may read only sourced values; "${fact}" is ${declared.get(fact)?.provenance ?? "undeclared"}.`,
          );
        }
      }
    }
    if (tier === "tier2") {
      const topLevel =
        isRecord(rule["when"]) && Array.isArray(rule["when"]["all"])
          ? rule["when"]["all"]
          : [rule["when"]];
      const requiredTrue = new Set<string>();
      for (const child of topLevel) {
        if (
          isRecord(child) &&
          child["operator"] === "is_true" &&
          typeof child["fact"] === "string"
        ) {
          requiredTrue.add(child["fact"]);
        }
      }
      for (const fact of factsRead) {
        const provenance = declared.get(fact)?.provenance;
        if (provenance !== "sourced" && provenance !== "approved") {
          err(
            6,
            `${path}.when`,
            `Tier 2 may read only sourced or approved values; "${fact}" is ${provenance ?? "undeclared"}.`,
          );
        } else if (provenance === "approved" && !requiredTrue.has(fact)) {
          err(
            6,
            `${path}.when`,
            `The approved value "${fact}" must be required is_true at the top level.`,
          );
        }
      }
    }
  });

  // Check 3: tiers never go backwards. Check 4: exactly one reject, last.
  for (let i = 1; i < tiersSeen.length; i += 1) {
    if (tiersSeen[i]! < tiersSeen[i - 1]!) {
      err(
        3,
        `rules[${i}].tier`,
        "Rules must appear in tier order: refuse, review, tier1, tier2, reject.",
      );
    }
  }
  if (rejectCount !== 1) {
    err(4, "rules", "A policy must have exactly one reject rule.");
  }

  // Check 11: every threshold used in tier 1 needs an approver.
  for (const name of thresholdUsedInTier1) {
    if (thresholds.get(name)?.approvedBy === undefined) {
      err(
        11,
        `thresholds.${name}.approvedBy`,
        `Threshold "${name}" is used in tier 1 and needs an approver.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
