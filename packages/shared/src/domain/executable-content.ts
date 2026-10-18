/**
 * Executable Content.
 *
 * The exact content that crosses the execution boundary to an
 * external Execution System: the action, target, and parameters
 * approved for a specific Business Transaction.
 *
 * This is the content bound by
 * ExecutionAuthorizationPayload.businessTransactionHash. Internal
 * trust-chain fields (authority, policy, signals, metadata, status,
 * createdAt) are intentionally out of scope: they never cross the
 * execution boundary and are not part of what an execution system
 * actually executes. Binding the hash to this narrower shape also
 * avoids depending on BusinessTransaction fields that are not stable
 * across the signing/verification boundary (for example, status may
 * be defaulted after signing but before other artifacts are built).
 */

export interface ExecutableContent {
  /**
   * Business Transaction identifier.
   */
  readonly businessTransactionId: string;

  /**
   * Approved action.
   */
  readonly action: string;

  /**
   * Approved target.
   */
  readonly target: string;

  /**
   * Approved parameters.
   */
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * Derives ExecutableContent from any source carrying the same
 * four fields (a BusinessTransaction's id plus its intent, or an
 * ExecutionRequest, etc.). The single point where the field list
 * is enumerated, so every call site stays in lockstep with the
 * ExecutableContent shape above instead of re-listing the fields
 * itself.
 */
export function toExecutableContent(
  input: Pick<
    ExecutableContent,
    "businessTransactionId" | "action" | "target" | "parameters"
  >,
): ExecutableContent {
  if (typeof input.target !== "string" || input.target.trim().length === 0) {
    throw new Error("ExecutableContent.target must be a non-empty string.");
  }

  return Object.freeze({
    businessTransactionId: input.businessTransactionId,
    action: input.action,
    target: input.target,
    parameters: Object.freeze({
      ...input.parameters,
    }),
  });
}
