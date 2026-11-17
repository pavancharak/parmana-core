import { policyV2 } from "@parmana/policy";
import { PostgresPoolFactory } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "../bootstrap/assertDatabaseUrlConfigured.js";

import { PolicyV2DecisionService } from "./policyV2Decisions.js";
import { PolicyV2RegisterService } from "./policyV2Register.js";
import { PolicyV2ReviewService } from "./policyV2Reviews.js";
import { PolicyV2SweepService } from "./policyV2Sweeps.js";
import { PolicyV2ReplayService } from "./policyV2Replay.js";
import { PolicyV2ConsoleService } from "./policyV2Console.js";
import type { NotificationChannels } from "./policyV2Notifications.js";

export interface PolicyV2Runtime {
  readonly decisions: PolicyV2DecisionService;
  readonly register: PolicyV2RegisterService;
  readonly reviews: PolicyV2ReviewService;
  readonly sweeps: PolicyV2SweepService;
  readonly replay: PolicyV2ReplayService;
  readonly console: PolicyV2ConsoleService;
}

/**
 * Builds the policy version 2 runtime from the environment. Off unless
 * PARMANA_POLICY_V2_DECISIONS is "true". When it is on, PARMANA_POLICY_V2_CAPABILITIES names the
 * capabilities that accept decisions, and the database must be configured. The register's write
 * path is on whenever the runtime is on.
 */
export function createPolicyV2Runtime(
  env: NodeJS.ProcessEnv = process.env,
  /** The channels that send alerts. None by default: alerts are then shown on the console only. */
  channels: NotificationChannels = {},
): PolicyV2Runtime | undefined {
  const flag = env.PARMANA_POLICY_V2_DECISIONS;
  if (flag === undefined || flag.trim() === "" || flag === "false") {
    return undefined;
  }
  if (flag !== "true") {
    throw new Error(
      `PARMANA_POLICY_V2_DECISIONS must be "true" or "false", got "${flag}".`,
    );
  }

  const capabilities = (env.PARMANA_POLICY_V2_CAPABILITIES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (capabilities.length === 0) {
    throw new Error(
      "PARMANA_POLICY_V2_CAPABILITIES must name at least one capability when policy version 2 decisions are on.",
    );
  }

  assertDatabaseUrlConfigured("PolicyV2");
  const pool = PostgresPoolFactory.create();
  const store = new policyV2.persistence.PolicyV2Store(pool);

  const decisions = new PolicyV2DecisionService({
    channels,
    store,
    enabledCapabilities: new Set(capabilities),
    // No source integration is connected, so sourced values refuse as unavailable.
    sources: async () => {
      throw new Error("No source integration is connected.");
    },
    nonces: new policyV2.persistence.PolicyV2NonceStore(pool),
  });

  const register = new PolicyV2RegisterService({ state: store });
  const reviews = new PolicyV2ReviewService({ store });

  const sweeps = new PolicyV2SweepService({ store, channels });

  const replay = new PolicyV2ReplayService({ store });
  const console = new PolicyV2ConsoleService({ store });

  return { decisions, register, reviews, sweeps, replay, console };
}

/**
 * Sets up the first Parmana owner from PARMANA_POLICY_V2_BOOTSTRAP_OWNER. It takes effect only
 * while the register has no owner, so setting it again later changes nothing. Returns true if
 * an owner was set up by this call.
 */
export async function bootstrapPolicyV2Owner(
  runtime: PolicyV2Runtime,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const owner = env.PARMANA_POLICY_V2_BOOTSTRAP_OWNER?.trim();
  if (owner === undefined || owner === "") return false;
  return runtime.register.bootstrapOwner(owner);
}

/**
 * The interval, in seconds, at which the sweeps run, from PARMANA_POLICY_V2_SWEEP_SECONDS. Unset
 * means the sweeps do not run on a timer. A value that is not a whole number from 1 to 86400 is
 * refused.
 */
export function policyV2SweepSecondsFrom(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = env.PARMANA_POLICY_V2_SWEEP_SECONDS;
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1 || Number(raw) > 86400) {
    throw new Error(
      `PARMANA_POLICY_V2_SWEEP_SECONDS must be a whole number from 1 to 86400, got "${raw}".`,
    );
  }
  return Number(raw);
}

/**
 * Runs the sweeps on an interval. A sweep that loses a race to another writer is skipped, and the
 * next run picks it up. Any other failure is passed to onError.
 */
export function startPolicyV2SweepTimer(
  sweeps: PolicyV2SweepService,
  seconds: number,
  onError: (error: unknown) => void,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    sweeps.run().catch((error: unknown) => {
      if (error instanceof policyV2.persistence.PersistenceConflictError)
        return;
      onError(error);
    });
  }, seconds * 1000);
}

/**
 * Starts the sweep timer for a runtime, if PARMANA_POLICY_V2_SWEEP_SECONDS is set. Returns the
 * timer so the caller can clear it on shutdown, or undefined if no timer was started.
 */
export function startPolicyV2Sweeps(
  runtime: PolicyV2Runtime | undefined,
  env: NodeJS.ProcessEnv = process.env,
  onError: (error: unknown) => void = (error) => {
    console.error("Policy version 2 sweep failed.", error);
  },
): ReturnType<typeof setInterval> | undefined {
  if (runtime === undefined) return undefined;
  const seconds = policyV2SweepSecondsFrom(env);
  if (seconds === undefined) return undefined;
  return startPolicyV2SweepTimer(runtime.sweeps, seconds, onError);
}
