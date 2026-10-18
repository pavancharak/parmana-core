import type { Policy } from "./types/Policy.js";
import type { PolicySignals } from "./types/PolicySignals.js";

/**
 * The types a policy may declare for a signal in signalsSchema.
 */
export const SIGNAL_TYPES = ["boolean", "number", "string"] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export interface SignalTypeViolation {
  readonly signalKey: string;
  readonly expected: string;
  readonly actual: string;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && !Number.isFinite(value))
    return "non-finite number";
  return typeof value;
}

/**
 * Signals whose value does not have the type the policy declares for it
 * in signalsSchema.
 *
 * Without this check a numeric signal sent as text ("150000") makes every
 * numeric operator false, so a rule written as "reject if amount gt X"
 * would not fire for it. A signal that is absent is not a type violation:
 * a missing fact already never satisfies a condition. A signal the schema
 * does not declare is not checked. A declared type outside SIGNAL_TYPES
 * is a violation, so a policy with a mistyped schema refuses rather than
 * evaluates unchecked (PolicyValidator rejects such a policy earlier).
 */
export function findSignalTypeViolations(
  policy: Pick<Policy, "signalsSchema">,
  signals: PolicySignals,
): SignalTypeViolation[] {
  const violations: SignalTypeViolation[] = [];
  for (const [signalKey, expected] of Object.entries(
    policy.signalsSchema ?? {},
  )) {
    if (!Object.hasOwn(signals, signalKey)) continue;
    const value = (signals as Record<string, unknown>)[signalKey];
    if (value === undefined) continue;
    const actual = typeOf(value);
    if (actual !== expected) {
      violations.push({ signalKey, expected, actual });
    }
  }
  return violations;
}
