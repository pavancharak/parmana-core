import crypto from "node:crypto";

import {
  DecisionOutcome,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Verification,
  VerificationStatus,
} from "@parmana/shared";

import { VerificationFailedError } from "../errors/VerificationFailedError.js";

import { ExecutionChainCrypto, VerificationCrypto } from "@parmana/crypto";

/**
 * Application service responsible for verifying
 * Execution Trust Records.
 *
 * Verification is deterministic and validates
 * the complete Execution Trust Record. All checks
 * always run and report — a failure in one check
 * does not skip the others, so the resulting message
 * can name every check that failed.
 */
export class VerificationService {
  private readonly crypto = new VerificationCrypto();

  private readonly chainCrypto = new ExecutionChainCrypto();

  constructor(private readonly trustRecords: ExecutionTrustRecordRepository) {}

  /**
   * Verifies an Execution Trust Record.
   */
  async verify(businessTransactionId: string): Promise<Verification> {
    const trustRecord = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (!trustRecord) {
      throw new VerificationFailedError("Execution Trust Record not found.");
    }

    const failures = await this.runChecks(trustRecord);

    const verified = failures.length === 0;

    const verification: Verification = {
      verificationId: crypto.randomUUID(),

      businessTransactionId,

      status: verified
        ? VerificationStatus.VERIFIED
        : VerificationStatus.FAILED,

      message: verified
        ? "Execution Trust Record verified successfully."
        : failures.join("; "),

      verifiedAt: new Date(),

      trustRecordHash: trustRecord.trustRecordHash,
    };

    await this.trustRecords.appendVerification(
      businessTransactionId,
      verification,
    );

    return verification;
  }

  /**
   * Runs every verification check independently and
   * returns the failure messages for every check that
   * did not pass. An empty array means every check
   * passed.
   */
  private async runChecks(
    trustRecord: ExecutionTrustRecord,
  ): Promise<string[]> {
    const failures: string[] = [];

    //
    // Integrity: recomputed hash must match the
    // stored hash.
    //
    const expectedHash = await this.crypto.hash(trustRecord);

    if (expectedHash !== trustRecord.trustRecordHash) {
      failures.push(
        "Integrity check failed: recomputed trust record hash " +
          `("${expectedHash}") does not match the stored hash ` +
          `("${trustRecord.trustRecordHash}").`,
      );
    }

    //
    // Signature: cryptographic signature must verify
    // against the stored public key.
    //
    const signatureVerified = await this.crypto.verifySignature(trustRecord);

    if (!signatureVerified) {
      failures.push(
        "Signature check failed: signature does not verify " +
          "against the stored key.",
      );
    }

    //
    // Authorization binding: every APPROVED execution
    // must carry a non-empty authorizationId in its
    // metadata. REJECTED executions are not required to.
    //
    for (const execution of trustRecord.executions) {
      if (execution.decision.outcome !== DecisionOutcome.APPROVED) {
        continue;
      }

      const authorizationId = execution.metadata?.authorizationId;

      if (typeof authorizationId !== "string" || authorizationId.length === 0) {
        failures.push(
          `Authorization binding check failed: execution ` +
            `"${execution.executionId}" is APPROVED but has no ` +
            "authorizationId in its metadata.",
        );
      }
    }

    //
    // Chain integrity: every chain-protected Execution's own
    // chainHash/chainSignature must verify, and previousChainHash
    // must correctly reference its predecessor's chainHash. An
    // Execution with no chain fields at all, before the first chained
    // one, is unprotected legacy data and does not fail this check;
    // one carrying only some chain fields, or following a chained
    // one, does (docs/VERIFICATION-GAPS.md G-89).
    //
    const chainResult = await this.chainCrypto.verifyChain(
      trustRecord.executions,
    );

    if (!chainResult.valid) {
      failures.push(
        "Execution chain integrity check failed" +
          (chainResult.brokenAt
            ? ` at execution "${chainResult.brokenAt}"`
            : "") +
          `: ${chainResult.reason ?? "chain verification failed"}.`,
      );
    }

    return failures;
  }
}
