import type { ApprovalNonceLedger } from "@parmana/shared";

import { approvalNonceLedger } from "../repositories.js";

/**
 * The Approval Artifact nonce ledger (decision D24), from the storage provider:
 * Postgres in production, in memory under NODE_ENV=test. The same ledger
 * records the nonce in the status write that consumes the approval, so the
 * verifier and the status write see one record.
 */
export function createApprovalNonceStore(): ApprovalNonceLedger {
  return approvalNonceLedger;
}
