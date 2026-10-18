import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  AuthorizationVerifier,
  CryptoBootstrap,
} from "../../src/index.js";
import type { ExecutableContent } from "@parmana/shared";

/**
 * Regulatory-evidence gap found while indexing CLAIMS.md against real
 * tests: zero committed, automated performance measurements existed
 * anywhere in this repo (only a manual, non-CI script requiring a live
 * deployed key, latency-test.cjs, and an investigation document that
 * explicitly states a full POST /execute round trip "remains
 * unmeasured"). This measures and reports the one piece that's safe to
 * benchmark deterministically in CI -- Ed25519 sign/verify throughput,
 * no network, no database, no HTTP layer -- and is explicit about what
 * it does NOT measure: HTTP overhead, database writes, or the full
 * request path a deployed server actually serves. See the
 * 2026-08-10 latency investigation (in git history) for that still-open,
 * broader question.
 *
 * The assertion bound is deliberately generous (an order of magnitude
 * above Ed25519's typical sub-millisecond cost) -- this is a smoke
 * test that catches a catastrophic regression (an accidental O(n^2)
 * path, a synchronous key reload per call), not a marketed SLA.
 */
describe("Authorization signing/verification performance (in-process, no network)", () => {
  const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
    businessTransactionId: "txn-perf-1",
    action: "hubspot:deal-update",
    target: "hubspot/deal/1",
    parameters: { dealstage: "closedwon" },
  };

  it("signs and verifies 200 authorizations within a generous smoke-test bound", async () => {
    const crypto = CryptoBootstrap.create();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const signer = new AuthorizationSigner(crypto);
    const verifier = new AuthorizationVerifier(crypto);

    const iterations = 200;

    const signStart = performance.now();

    const signed = [];
    for (let i = 0; i < iterations; i++) {
      signed.push(
        await signer.sign(
          {
            decisionId: `decision-${i}`,
            businessTransactionId: `txn-${i}`,
            policyName: "hubspot-deal-update",
            policyVersion: "1.0.0",
            submittedBy: "caller-perf",
            grantedCapability: "hubspot:deal-update",
            executableContent: SAMPLE_EXECUTABLE_CONTENT,
          },
          privateKey,
          "key-1",
          60,
        ),
      );
    }

    const signElapsedMs = performance.now() - signStart;

    const verifyStart = performance.now();

    for (const authorization of signed) {
      const result = await verifier.verify(authorization, publicKey);
      expect(result.valid).toBe(true);
    }

    const verifyElapsedMs = performance.now() - verifyStart;

    console.log(
      `[perf] ${iterations} sign() calls: ${signElapsedMs.toFixed(1)}ms total, ` +
        `${(signElapsedMs / iterations).toFixed(3)}ms/op. ` +
        `${iterations} verify() calls: ${verifyElapsedMs.toFixed(1)}ms total, ` +
        `${(verifyElapsedMs / iterations).toFixed(3)}ms/op.`,
    );

    // Generous smoke bound: 25ms/op average, ~25x a typical Ed25519
    // operation's real cost. Catches catastrophic regressions, not a
    // performance SLA -- see docstring above.
    expect(signElapsedMs / iterations).toBeLessThan(25);
    expect(verifyElapsedMs / iterations).toBeLessThan(25);
  });
});
