import type { Policy } from "./types/Policy.js";
import type { PolicySignals } from "./types/PolicySignals.js";

/**
 * The subset of a Business Transaction's Intent that
 * ExecutableContent is actually built from, and that
 * a Policy's boundSignals dot-paths resolve against.
 */
export interface IntentSnapshot {
  readonly target?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/**
 * One boundSignals entry whose declared signal value did not
 * match the value found at its Intent dot-path.
 */
export interface SignalIntentBindingViolation {
  readonly signalKey: string;
  readonly intentPath: string;
  readonly signalValue: unknown;
  readonly intentValue: unknown;
}

/**
 * Resolves a dot-path ("parameters.amount", "target") against an
 * IntentSnapshot. Returns undefined for any missing segment rather
 * than throwing — a missing Intent field is reported as a mismatch
 * (undefined almost never equals a declared signal value), not a
 * crash.
 */
function resolveIntentPath(intent: IntentSnapshot, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, intent);
}

/**
 * Signal/Intent Binder.
 *
 * Enforces a Policy's boundSignals declarations: every declared
 * signal must equal the value found at its corresponding Intent
 * dot-path. This runs before PolicyEngine.evaluate, over the exact
 * signals PolicyEngine would otherwise evaluate and the exact
 * Intent that ExecutionGateway will sign and execute if the
 * transaction is approved.
 *
 * Deliberately does not evaluate policy rules, execute actions, or
 * access anything beyond the two values it is given — same
 * discipline as PolicyEngine itself.
 */
export class SignalIntentBinder {
  /**
   * Returns every boundSignals entry whose declared value does not
   * strictly equal the value at its Intent dot-path. An empty array
   * means either the policy declares no boundSignals, or every
   * declared binding matched.
   */
  public findViolations(
    policy: Policy,
    signals: PolicySignals,
    intent: IntentSnapshot,
  ): SignalIntentBindingViolation[] {
    const bindings = policy.boundSignals;

    if (!bindings) {
      return [];
    }

    const violations: SignalIntentBindingViolation[] = [];

    for (const [signalKey, intentPath] of Object.entries(bindings)) {
      const signalValue = signals[signalKey];
      const intentValue = resolveIntentPath(intent, intentPath);

      if (signalValue !== intentValue) {
        violations.push({
          signalKey,
          intentPath,
          signalValue,
          intentValue,
        });
      }
    }

    return violations;
  }
}
