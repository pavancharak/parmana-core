import { PostgresPoolFactory } from "@parmana/storage";

import {
  KillSwitchService,
  type KillSwitchOptions,
} from "../killSwitch/KillSwitchService.js";
import {
  PostgresKillSwitchProbeLog,
  PostgresKillSwitchStore,
} from "../killSwitch/PostgresKillSwitchStore.js";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Creates the operator kill switch (ADR-0017), or returns undefined when it
 * is not enabled.
 *
 * Off unless KILL_SWITCH_ENABLED=true, so deploying this code changes nothing
 * on its own. When on, the switch is durable (Postgres, through DATABASE_URL)
 * and fails closed if DATABASE_URL is missing. KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR
 * must be stated as "true" or "false" when the switch is on: production sets it
 * to "true" (ADR-0017 decision 1), and nothing defaults it.
 */
export function createKillSwitch(): KillSwitchService | undefined {
  const enabled = process.env.KILL_SWITCH_ENABLED;

  if (enabled === undefined || enabled.trim() === "" || enabled === "false") {
    return undefined;
  }

  if (enabled !== "true") {
    throw new Error(
      `KILL_SWITCH_ENABLED must be "true" or "false", got "${enabled}".`,
    );
  }

  const twoPerson = process.env.KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR;

  if (twoPerson !== "true" && twoPerson !== "false") {
    throw new Error(
      'KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR must be "true" or "false" when the kill switch is enabled.',
    );
  }

  assertDatabaseUrlConfigured("KillSwitch");

  const pool = PostgresPoolFactory.create();
  const options: KillSwitchOptions = {
    resetNeedsSecondOperator: twoPerson === "true",
    probes: new PostgresKillSwitchProbeLog(pool),
  };

  return new KillSwitchService(new PostgresKillSwitchStore(pool), options);
}
