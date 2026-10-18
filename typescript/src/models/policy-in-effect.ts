/**
 * The policy a capability's requests must declare right now, and what a
 * request under it must carry. The response of
 * GET /policies/in-effect?capability=...
 */
export interface PolicyInEffect {
  readonly capability: string;

  /**
   * Declare this, exactly, as the request's `policy`.
   */
  readonly policy: {
    readonly name: string;
    readonly version: string;
    readonly schemaVersion: string;
  };

  /**
   * The policy author's description for people, or null.
   */
  readonly description: string | null;

  /**
   * Present only when the policy requires it: your key needs a current
   * authority grant for this capability, and each request must be within
   * the grant's limits (RFC-0023 phase 3).
   */
  readonly authorityGrantRequired?: true;

  readonly signals: PolicySignalRequirements;
}

/**
 * What a request under a policy must carry. Rule conditions are not
 * included.
 */
export interface PolicySignalRequirements {
  /**
   * Every fact the policy's rules read, sorted. Send each one in the
   * request's `signals`.
   */
  readonly facts: readonly string[];

  /**
   * The declared type of each signal: `boolean`, `number` or `string`.
   */
  readonly schema: Readonly<Record<string, string>>;

  /**
   * Signals that must equal a value of the Intent, as signal name to path,
   * for example `refundAmount` to `parameters.amount`.
   */
  readonly bound: Readonly<Record<string, string>>;

  /**
   * Signals that count as true only with a signed approval in
   * `signals.approvalArtifact`, and where the resource (and the amount, if
   * any) the approval must name are in the request.
   */
  readonly approval: Readonly<
    Record<string, { readonly resourceId: string; readonly value?: string }>
  >;

  /**
   * Facts the server asks a business system for itself, as signal name to
   * source, claim and subject path. Present only when the policy has any.
   * You need not send them; a value you send that differs from the
   * source's is refused.
   */
  readonly sourced?: Readonly<
    Record<
      string,
      {
        readonly source: string;
        readonly claim: string;
        readonly subject: string;
        readonly maxAgeSeconds?: number;
      }
    >
  >;
}
