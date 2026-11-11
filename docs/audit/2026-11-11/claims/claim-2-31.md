# 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

Source: CLAIMS.md (commit d1d63c6), lines 1077-1111.

## Exact claim text

## 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

The capability that let a caller submit an action is carried in the signed authorization, and the connector layer checks it against the action being run.

**What is signed.** `ExecutionAuthorizationPayload` has two optional signed fields:

- `submittedBy` is the caller ID.
- `grantedCapability` is the capability the caller was cleared for at the API edge (`isCapabilityAllowed()`).

Both are optional, so authorizations issued before they existed still verify unchanged. The server sets both from the caller's own check, not from client input. `POST /execute` and `POST /transactions` both set them, and both write a `caller.capability_granted` audit event for each grant.

**What the connector layer checks.** `DefaultConnectorPolicy.assertAllowed()` (`packages/execution-control/src/ConnectorPolicy.ts`) rejects a request when `grantedCapability` is present and does not equal the action being executed. This check runs before the gateway session is consumed. When `grantedCapability` is absent, the check is skipped, not failed open. That case means caller authentication was disabled, not that every action is granted.

**Scope and limits.**

- This is defense in depth. `ExecutionGateway.verify()` already verifies the authorization signature before `ExecutionGateway.execute()` is called, and today that is the only route to `assertAllowed()`. The new check does not verify the signature again. It checks that a value inside an already-verified payload matches the action.
- The check protects against a future code path that reaches `assertAllowed()` without the current verified route. It does not protect against a party who already controls in-process code and internal wiring. That party can set `grantedCapability` as easily as the existing `verifiedTransaction` booleans.
- A signed `grantedCapability` shows what the caller was cleared for at the time of the check. It does not show that the caller still holds the capability.

**Audit storage.** The `caller_audit_events` table accepts the `caller.capability_granted` event type (migration `20260911090000_add_capability_granted_to_caller_audit_events.sql`). Without that migration, every authenticated request that writes this event fails closed when the audit write fails (2.19). The migration must be applied before this version is deployed.

**Evidence.**

- `packages/shared/src/domain/execution-authorization.ts` (`submittedBy`, `grantedCapability` on `ExecutionAuthorizationPayload`)
- `packages/shared/src/domain/metadata.ts` (`grantedCapability` on `TransactionMetadata`)
- `packages/api/src/routes/execute.ts` and `packages/api/src/routes/transactions.ts` (both set `grantedCapability` and write `caller.capability_granted`)
- `packages/crypto/src/AuthorizationSigner.ts` and `packages/runtime/src/RuntimeAuthorizationSigner.ts`, `RuntimeEngine.ts` (the fields are carried into the signed payload)
- `packages/execution-control/src/ConnectorPolicy.ts` (the consistency check in `assertAllowed()`)
- `packages/crypto/tests/unit/authorization-envelope.test.ts` (the fields are included when supplied and omitted when not, and a tampered `grantedCapability` fails verification)
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (the fields are passed from transaction metadata through the runtime wiring)
- `packages/execution-control/tests/unit/connector-policy-granted-capability.test.ts` (allowed when the action matches or the field is absent, rejected on a mismatch)
- `packages/api/tests/integration/caller-auth.integration.test.ts` (`POST /transactions` and `POST /execute` produce the same signed `grantedCapability` for the same caller)

Dated updates, including the parity fix for `POST /transactions` and the audit constraint fix found in a real deployment, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `packages/api/src/routes/execute.ts`: EXISTS
- `packages/api/src/routes/transactions.ts`: EXISTS
- `packages/api/tests/integration/caller-auth.integration.test.ts`: EXISTS
- `packages/crypto/src/AuthorizationSigner.ts`: EXISTS
- `packages/crypto/tests/unit/authorization-envelope.test.ts`: EXISTS
- `packages/execution-control/src/ConnectorPolicy.ts`: EXISTS
- `packages/execution-control/tests/unit/connector-policy-granted-capability.test.ts`: EXISTS
- `packages/runtime/src/RuntimeAuthorizationSigner.ts`: EXISTS
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts`: EXISTS
- `packages/shared/src/domain/execution-authorization.ts`: EXISTS
- `packages/shared/src/domain/metadata.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                           | Status | Tests | Passed | Skipped |
| ----------------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/integration/caller-auth.integration.test.ts`                    | passed | 27    | 27     | 0       |
| `packages/crypto/tests/unit/authorization-envelope.test.ts`                         | passed | 15    | 15     | 0       |
| `packages/execution-control/tests/unit/connector-policy-granted-capability.test.ts` | passed | 3     | 3      | 0       |
| `packages/runtime/tests/unit/execution-authorization-wiring.test.ts`                | passed | 10    | 10     | 0       |
