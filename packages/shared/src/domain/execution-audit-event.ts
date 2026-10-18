/**
 * Execution-audit event.
 *
 * Defined in `@parmana/shared`, not `@parmana/execution-control` (where
 * `ExecutionControlService` actually produces these), because
 * `packages/storage`'s `SupabaseExecutionAuditSink` also needs this
 * shape and `tests/architecture/execution-boundary.test.ts` enforces a
 * closed dependent set for `@parmana/execution-control` imports
 * (`execution-control`, `execution-gateway`, and `api` only) —
 * `storage` is not on that list, deliberately, and importing this type
 * through `@parmana/shared` instead (which every package may depend
 * on) keeps that boundary intact rather than widening it.
 * `@parmana/execution-control` re-exports this same type from its own
 * `types.ts`, so every existing consumer there is unaffected.
 */
export interface ExecutionAuditEvent {
  /**
   * "authorization.verified" is never emitted by
   * `ExecutionControlService` itself — Parmana's own envelope/gateway
   * verification is already durably recorded via the
   * `ExecutionGateway.verify()` call that must pass before
   * `ExecutionControlService.execute()` is ever reached at all, so a
   * separate "verified" event on this side would be redundant. It
   * exists in this union solely so a reader of
   * `SupabaseExecutionAuditSink.query()` has a fully-typed result for
   * rows a different writer sharing this table records — see
   * `parmana-paytm-agent`'s own audit writer (`src/parmana/audit.ts`
   * in that repository), which records it right after independently
   * verifying the Ed25519 authorization signature this service
   * forwarded to it, before calling Paytm.
   */
  readonly type:
    | "session.created"
    | "execution.rejected"
    | "execution.completed"
    | "authorization.verified";
  readonly occurredAt: string;
  readonly connectorId: string;
  readonly authorizationId: string;
  readonly sessionId: string;
  readonly reason?: string;

  /**
   * The ExecutableContent.businessTransactionId this event concerns
   * (GAP-3, GAPS.md 2026-09-14). Optional — recorded from
   * release.executableContent.businessTransactionId by
   * ExecutionControlService, but absent from events recorded by any
   * other writer to this same durable store that has no
   * ExecutionRelease to read it from. This is the one correlation key
   * a remote, out-of-process connector service (e.g.
   * parmana-paytm-agent) can actually supply on its own audit writes —
   * unlike authorizationId, which is Parmana's own internal
   * authorization identity and never forwarded across that trust
   * boundary (see GatewayPaytmAdapter's own wire contract). Querying
   * SupabaseExecutionAuditSink by businessTransactionId is therefore
   * the way to retrieve one refund's complete story across both
   * services, not authorizationId, which only chains events written
   * on this side.
   */
  readonly businessTransactionId?: string;

  /** Metadata only — never the credential's secret value. */
  readonly credentialId?: string;
  readonly gatewayId?: string;

  /** ExecutableContent.action this event concerns — the capability granted or rejected. */
  readonly action?: string;
}

export interface ExecutionAuditSink {
  record(event: ExecutionAuditEvent): Promise<void>;
}
