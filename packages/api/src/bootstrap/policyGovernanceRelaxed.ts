/**
 * Whether policy governance (maker-checker approval records) may be
 * skipped at execution time.
 *
 * Relaxed only when ALL hold:
 *   - NODE_ENV is exactly "test" or "development";
 *   - PARMANA_ALLOW_UNGOVERNED_POLICY is exactly "true" (explicit opt-in); and
 *   - POLICY_EXECUTION_VERIFICATION_ENFORCED is not "true".
 *
 * Previously NODE_ENV alone relaxed governance, so a deployment that set
 * NODE_ENV=test ran unapproved policies. The opt-in is now required, and
 * it is never honoured in any other NODE_ENV. Even when relaxed, the
 * policy content hash is still required and checked (see
 * createExecutionGateway.ts).
 */
export function policyGovernanceRelaxed(): boolean {
  const env = process.env.NODE_ENV;

  return (
    (env === "test" || env === "development") &&
    process.env.PARMANA_ALLOW_UNGOVERNED_POLICY === "true" &&
    process.env.POLICY_EXECUTION_VERIFICATION_ENFORCED !== "true"
  );
}
