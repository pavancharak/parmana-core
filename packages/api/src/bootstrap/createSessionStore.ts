import { randomUUID } from "node:crypto";

import { InMemoryGatewaySessionStore } from "@parmana/execution-control";

/**
 * Same-process capability token shared between ExecutionControlService
 * and InMemoryGatewaySessionStore during bootstrap: create() only
 * accepts a GatewaySession-issuance call whose issuanceAuthentication
 * is reference-equal (===) to this exact object (see
 * GatewaySessionStore.ts). This governs GatewaySession issuance calls
 * WITHIN this same process — a separate, narrower trust boundary from
 * the Gateway's own gatewayAuthentication (createGatewayKeyPair.ts),
 * which is what a remote caller is actually checked against.
 *
 * A random value here (rather than a bare `{}`) is generated once per
 * process start so this is never confused with a fixed, guessable
 * constant, even though reference identity — not the value's
 * contents — is the entire mechanism: only code holding this exact
 * object reference (i.e. code within this same process, wired through
 * createExecutionControl.ts) can ever satisfy the check. There is
 * nothing to configure here across a process restart or a second
 * instance: both construct their own fresh, independent token the
 * same way.
 */
const gatewaySessionIssuanceAuthentication = Object.freeze({
  token: randomUUID(),
});

export function createSessionStore(): InMemoryGatewaySessionStore {
  return new InMemoryGatewaySessionStore(gatewaySessionIssuanceAuthentication);
}

export { gatewaySessionIssuanceAuthentication };
