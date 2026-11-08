import { parseApiKeys, type ApiKeyEntry } from "@parmana/shared";

/** The caller id of the kill switch probe's key in PARMANA_API_KEYS (KILL-SWITCH-OPERATIONS.md). */
export const PROBE_CALLER_ID = "kill-switch-probe";

/** The only capability the probe key may hold. */
export const PROBE_CAPABILITY = "kill-switch:probe";

/**
 * Refuses to start when the kill switch probe's key is missing, holds the wrong capability, or holds
 * more than the probe needs. Runs only when the kill switch is on, which is when the probe matters.
 *
 * The server cannot see the repository secret PARMANA_PROBE_KEY, so it cannot check that the key
 * matches. The probe workflow checks that itself on each run, and reports a mismatch as such.
 */
export function assertProbeKeyEntry(entries: readonly ApiKeyEntry[]): void {
  const probe = entries.find((entry) => entry.callerId === PROBE_CALLER_ID);
  if (probe === undefined) {
    throw new Error(
      `PARMANA_API_KEYS has no "${PROBE_CALLER_ID}" entry, so the kill switch probe cannot run. ` +
        "Add the probe key as described in docs/internal/runbooks/KEY-ROTATION.md, section 6.",
    );
  }
  const capabilities = probe.allowedCapabilities ?? [];
  if (capabilities.length !== 1 || capabilities[0] !== PROBE_CAPABILITY) {
    throw new Error(
      `The "${PROBE_CALLER_ID}" entry in PARMANA_API_KEYS must hold exactly ` +
        `allowedCapabilities ["${PROBE_CAPABILITY}"]. It holds ${JSON.stringify(capabilities)}.`,
    );
  }
}

/** Reads PARMANA_API_KEYS from the environment and checks the probe entry. */
export function assertProbeKeyEntryFromEnv(
  value: string | undefined = process.env.PARMANA_API_KEYS,
): void {
  assertProbeKeyEntry(parseApiKeys(value));
}
