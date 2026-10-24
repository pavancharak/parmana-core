import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown BEFORE an action is released to a connector when the operator kill
 * switch is on (ADR-0017). The HTTP guard refuses a request that arrives while
 * the switch is on; this refuses one that passed the guard and reached release
 * after a trip, so a trip between the two still stops the action.
 *
 * Nothing has been executed. The caller can retry once an operator has reset
 * the switch.
 *
 * Extends RuntimeError so packages/api's error handler maps it to its own
 * .status and .code with no change.
 */
export class KillSwitchActiveError extends RuntimeError {
  constructor() {
    super(
      "The operator kill switch was tripped before this action was released. " +
        "Nothing was executed.",
      503,
      "KILL_SWITCH_ACTIVE",
    );
  }
}
