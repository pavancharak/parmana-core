import type { ExecutionTrustApplication } from "@parmana/runtime";

/**
 * Decides whether a Business Transaction was submitted by the given
 * authenticated caller, using the server-set metadata.submittedBy
 * field (see execute.ts / transactions.ts, which overwrite it from
 * req.callerId — never trusted from client input).
 *
 * Without this check, /trust-records, /verify, /verification,
 * /replay, and /receipt* all key purely off businessTransactionId
 * with no ownership check at all: any authenticated caller could
 * read any other caller's complete transaction, trust record, and
 * receipt history (IDOR / broken object-level authorization).
 *
 * Returns true when the transaction does not exist at all — a
 * missing transaction is not an ownership question, and the calling
 * route's own not-found handling should run unchanged rather than
 * being pre-empted here.
 */
export async function isOwnedByCaller(
  application: ExecutionTrustApplication,
  businessTransactionId: string,
  callerId: string,
): Promise<boolean> {
  const transaction = await application.getTransaction(businessTransactionId);

  if (!transaction) {
    return true;
  }

  return transaction.metadata?.submittedBy === callerId;
}
