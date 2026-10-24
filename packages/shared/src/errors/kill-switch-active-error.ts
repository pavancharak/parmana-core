import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown BEFORE an action is released to a connector while the operator kill
 * switch is on (ADR-0017). The HTTP guard refuses a request that arrives while
 * the switch is on. The runtime's pre-release hook and the gateway's release
 * gate refuse one that passed the guard and reached release after a trip.
 *
 * Nothing has been executed. The caller can retry once an operator has reset
 * the switch.
 *
 * Lives in @parmana/shared so the runtime, the execution gateway and the API
 * error handler all recognize it without depending on one another.
 */
export class KillSwitchActiveError extends ParmanaError {
  constructor() {
    super(
      "KILL_SWITCH_ACTIVE",
      "The operator kill switch was tripped before this action was released. Nothing was executed.",
      503,
    );
  }
}
