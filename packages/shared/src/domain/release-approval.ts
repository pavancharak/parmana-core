/**
 * One signed human approval behind a released action, as the Execution
 * Gateway found it in the request's signals after checking them against
 * the authorization's signed signalsHash. It names who approved and with
 * which key; the approval itself was verified when the decision was
 * made. An external connector's signed release lists these as
 * approvedBy (ADR-0013).
 */
export interface ReleaseApproval {
  readonly approverId: string;
  readonly keyId: string;
  readonly approvalId: string;
}
