import type { Signature } from "@parmana/shared";

import { AuditEventCrypto } from "./AuditEventCrypto.js";
import { CryptoBootstrap } from "./CryptoBootstrap.js";
import { TrustRecordHasher } from "./TrustRecordHasher.js";

/**
 * One caller_audit_events row, in the shape a verifier reads it back:
 * the original CallerAuditEvent-shaped fields (occurredAt, callerId,
 * etc, exactly as SupabaseCallerAuditSink.record() received them —
 * never including storage-only fields like a database row id), plus
 * the signature and chain columns that sit alongside it.
 */
export interface ChainedCallerAuditEventRow {
  readonly event: Record<string, unknown>;
  readonly signature: Signature;
  readonly chainHash: string | null;
  readonly previousChainHash: string | null;
  readonly chainPosition: number | null;
}

export interface CallerAuditChainVerificationResult {
  readonly valid: boolean;
  readonly brokenAtPosition?: number;
  readonly reason?: string;
}

/**
 * Verifies one caller's full audit chain (SupabaseCallerAuditSink's
 * per-caller chaining): each row's signature against its own
 * recomputed content -- including the previousChainHash/chainPosition
 * fields folded into what was actually signed -- and that each row's
 * previousChainHash references the immediately-preceding row's own
 * chainHash. No network call, no database, no running Parmana
 * process: pass it rows already fetched from storage, in ascending
 * chain_position order. The same standalone discipline
 * docs/site/guides/verify-independently.mdx demonstrates for
 * ExecutionTrustRecord, extended to the caller-audit trail.
 *
 * A deleted row breaks this: the row after it still carries the
 * deleted row's chainHash as its own previousChainHash, but the
 * row before it has a different chainHash -- the linkage check below
 * catches the mismatch, which is exactly the gap this class closes
 * (see docs/site/trust-and-claims/objections-and-evidence.mdx,
 * Domain 3).
 *
 * Rows with no chain fields at all (no callerId at write time --
 * the earliest possible rejection, or caller.rejected) are verified
 * for signature only, never required to link -- the same "absent
 * means unprotected, not broken" discipline
 * ExecutionChainCrypto.verifyChain() already applies to legacy,
 * pre-chain-feature Executions.
 */
export class CallerAuditChainVerifier {
  private readonly crypto = new AuditEventCrypto();

  private readonly hasher = new TrustRecordHasher(CryptoBootstrap.create());

  /**
   * `anchor`, when given, is the chain head (last chainPosition and its
   * chainHash) recorded outside the database when the chain was last seen.
   * The chain must end exactly there. Without an anchor, deleting the newest
   * rows leaves a valid, shorter chain: that cannot be detected from the
   * rows alone.
   */
  async verifyChain(
    rows: readonly ChainedCallerAuditEventRow[],
    anchor?: { readonly chainPosition: number; readonly chainHash: string },
  ): Promise<CallerAuditChainVerificationResult> {
    let previousHash: string | null = null;
    let position = 0;

    for (const row of rows) {
      position++;

      const isChained = row.chainHash !== null && row.chainPosition !== null;

      const signedContent = isChained
        ? {
            ...row.event,
            previousChainHash: row.previousChainHash,
            chainPosition: row.chainPosition,
          }
        : row.event;

      const signatureValid = await this.crypto.verify(
        signedContent,
        row.signature,
      );

      if (!signatureValid) {
        return {
          valid: false,
          brokenAtPosition: position,
          reason: "signature does not match recomputed content.",
        };
      }

      if (!isChained) {
        previousHash = null;
        continue;
      }

      const expectedHash = await this.hasher.hash(signedContent);

      if (expectedHash !== row.chainHash) {
        return {
          valid: false,
          brokenAtPosition: position,
          reason: "chainHash does not match recomputed content.",
        };
      }

      if (row.previousChainHash !== previousHash) {
        return {
          valid: false,
          brokenAtPosition: position,
          reason:
            "previousChainHash does not reference the prior event's chainHash.",
        };
      }

      previousHash = row.chainHash;
    }

    if (anchor !== undefined) {
      const last = rows[rows.length - 1];

      if (
        last === undefined ||
        last.chainPosition !== anchor.chainPosition ||
        last.chainHash !== anchor.chainHash
      ) {
        return {
          valid: false,
          brokenAtPosition: position,
          reason: "chain does not end at the anchored chain head (records missing or truncated).",
        };
      }
    }

    return { valid: true };
  }
}
