import type { GatewayIdentity } from "@parmana/execution-control";

const DEFAULT_GATEWAY_ID = "parmana-gateway";

/**
 * gatewayId becomes part of every audit event and attestation this
 * process signs (see GatewayAttestationSigner, ExecutionAuditEvent) --
 * kept to a conservative, operator-controlled character set rather than
 * accepting arbitrary bytes into those records.
 */
const VALID_GATEWAY_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Creates the identity presented by the
 * Execution Gateway to Execution Control.
 *
 * gatewayId/publicIdentity default to "parmana-gateway" but are
 * configurable via PARMANA_GATEWAY_ID -- mirrors
 * createGatewayKeyPair.ts's PARMANA_GATEWAY_KEY_ID pattern. Running
 * more than one logically distinct gateway (e.g. per-environment or
 * per-tenant) against the same Execution Control audit trail requires
 * each to present a distinct gatewayId; a hardcoded literal made that
 * impossible without editing source.
 */
export function createGatewayIdentity(): GatewayIdentity {
  const gatewayId = process.env.PARMANA_GATEWAY_ID ?? DEFAULT_GATEWAY_ID;

  if (!VALID_GATEWAY_ID.test(gatewayId)) {
    throw new Error(
      `Invalid PARMANA_GATEWAY_ID: ${JSON.stringify(gatewayId)}. Must match ${VALID_GATEWAY_ID}.`,
    );
  }

  return Object.freeze({
    gatewayId,

    publicIdentity: gatewayId,

    authenticationMetadata: Object.freeze({}),
  });
}
