import { runPolicyGovernanceIntegrityCheckOnce } from "./policyGovernanceIntegrityCheckRunner.js";

const DEFAULT_INTERVAL_MS = 5 * 60_000;

/**
 * Repeats the Policy Governance integrity check (see
 * verifyPolicyGovernanceIntegrityAtStartup.ts) on a fixed interval, on
 * top of (never instead of) the one-time startup run
 * (verifyPolicyGovernanceIntegrityAtStartup.ts). The startup-only
 * check leaves an out-of-band edit to a live policy.json -- made
 * while the process keeps running, between deploys -- undetected
 * until the next restart; this closes that window down to the
 * interval below instead.
 *
 * Every run goes through the same construction and fail-open error
 * handling as the startup check (runPolicyGovernanceIntegrityCheckOnce),
 * so a failed run is logged and never throws into the caller, never
 * blocks or slows request handling. The interval timer itself is
 * .unref()'d, the same discipline createGracefulShutdown.ts's own
 * force-exit timer uses, so this can never by itself keep the process
 * alive past a clean shutdown.
 *
 * Set POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS (milliseconds) to
 * override the default of 5 minutes; 0 or a negative value disables
 * periodic re-checks and leaves only the one-time startup check.
 */
export function schedulePolicyGovernanceIntegrityCheck(): void {
  const configured = Number(
    process.env.POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS ??
      DEFAULT_INTERVAL_MS,
  );

  const intervalMs = Number.isFinite(configured)
    ? configured
    : DEFAULT_INTERVAL_MS;

  if (intervalMs <= 0) {
    return;
  }

  const timer = setInterval(runPolicyGovernanceIntegrityCheckOnce, intervalMs);
  timer.unref?.();
}
