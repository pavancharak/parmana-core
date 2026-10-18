import type { JsonValue } from "@parmana/shared";
import type { PolicySignals } from "@parmana/policy";

/**
 * Converts opaque runtime signals into PolicySignals.
 *
 * Replay assumes BusinessTransaction signals have
 * already been validated before persistence.
 */
export function toPolicySignals(
  signals: Readonly<Record<string, unknown>>,
): PolicySignals {
  return signals as Record<string, JsonValue>;
}
