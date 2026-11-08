/**
 * Runs the no-bypass probe once (RFC-0024 decision 6, gap G-146). See docs/internal/runbooks/BYPASS-PROBE.md.
 *
 *   BYPASS_PROBE_TARGET_URL=https://... BYPASS_PROBE_SIGNING_KEY_PEM="$(cat key.pem)" npx tsx scripts/run-bypass-probe.ts
 *
 * Exit codes: 0 nothing configured, or the route refused the request. 1 a configuration error, or the probe could
 * not verify protection. 2 the route accepted a request with no approval (a bypass).
 */

import { runBypassProbeFromEnv } from "../packages/api/src/inbound/bypassProbeFromEnv.js";

const result = await runBypassProbeFromEnv(process.env);

if (result.kind === "not-configured") {
  console.log(result.message);
  process.exit(0);
}

if (result.kind === "config-error") {
  console.error(`bypass probe: ${result.message}`);
  process.exit(1);
}

console.log(JSON.stringify(result.record, null, 2));

if (result.bypass) {
  console.error(
    `BYPASS: ${result.record.targetName} accepted a request with no approval. Protection failed.`,
  );
  process.exit(2);
}

process.exit(result.record.outcome === "refused" ? 0 : 1);
