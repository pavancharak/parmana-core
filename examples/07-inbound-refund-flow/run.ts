import { print, printHeading } from "../shared/helpers/print.js";
import {
  AUDIENCE,
  postJson,
  startInboundServer,
  verifyDecision,
  type IssuedDecision,
} from "../shared/helpers/inbound-server.js";

//
// RFC-0025, end to end: one inbound refund from request to recorded outcome.
//
// The steps a partner's agent and Parmana take together:
//
//   1. The partner asks Parmana for a decision on a refund.
//   2. Parmana approves it within the partner's limit and signs it.
//   3. The partner checks the decision before refunding: signature, audience, expiry, limit.
//   4. The partner refunds through its own refund system.
//   5. The partner reports the outcome to Parmana, which records it.
//
// The refund in step 4 is simulated. No money moves. The partner's real refund system is not
// part of Parmana, so this example stands in for it with a stub.
//

const DECISIONS_PATH = "/v1/inbound/decisions";
const OUTCOMES_PATH = "/v1/inbound/outcomes";

const ORDER_ID = "ORD-7001";
const PAYMENT_ID = "pay_7001";
const AMOUNT_INR = 800;

/** Stands in for the partner's refund system. No money moves. */
function simulateRefund(
  paymentId: string,
  amountInr: number,
): { refundId: string } {
  console.log(
    `[simulated refund system] refund of INR ${amountInr} on ${paymentId}`,
  );

  return { refundId: `rfnd_sim_${Date.now()}` };
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" Parmana Example 07 - Inbound Refund Flow");
  console.log("========================================");

  printHeading("PARMANA SIDE: Start the inbound routes");

  const server = await startInboundServer({ "partner-a": 1000 });

  console.log(`Listening on ${server.url}`);
  console.log("partner-a holds an active grant with a limit of INR 1000.");

  const unexpected: string[] = [];

  //
  // Step 1: the partner asks for a decision.
  //
  printHeading("PARTNER SIDE: Step 1 - Ask Parmana for a decision");

  console.log(
    `Order ${ORDER_ID}, payment ${PAYMENT_ID}, refund of INR ${AMOUNT_INR}.`,
  );

  const asked = await postJson(
    server.url,
    DECISIONS_PATH,
    { paymentId: PAYMENT_ID, amountInr: AMOUNT_INR, audience: AUDIENCE },
    "partner-a",
  );

  console.log(`HTTP ${asked.status}`);
  print("Decision", asked.body);

  const decision = asked.body as unknown as IssuedDecision;

  //
  // Step 2 and 3: Parmana decided; the partner checks the decision before refunding.
  //
  printHeading(
    "PARTNER SIDE: Step 2 and 3 - Check the decision before refunding",
  );

  const checks = {
    decisionApproved: asked.status === 201 && decision.outcome === "approved",
    signatureValid:
      asked.status === 201 && verifyDecision(server.publicKey, decision),
    audienceMatches: decision.audience === AUDIENCE,
    notExpired: new Date(decision.expiresAt).getTime() > Date.now(),
    withinLimit: AMOUNT_INR <= decision.limitInr,
    paymentMatches: decision.paymentId === PAYMENT_ID,
  };

  print("Checks", checks);

  const allChecksPass = Object.values(checks).every(
    (passed) => passed === true,
  );

  if (!allChecksPass) {
    unexpected.push("decision failed the partner's checks");
  }

  //
  // Step 4: the partner refunds, only if every check passed.
  //
  printHeading("PARTNER SIDE: Step 4 - Refund through the partner's system");

  const refund = allChecksPass
    ? simulateRefund(PAYMENT_ID, AMOUNT_INR)
    : undefined;

  if (refund) {
    console.log(`Refund ${refund.refundId} returned by the simulated system.`);
  } else {
    console.log("No refund made: a check failed.");
  }

  //
  // Step 5: the partner reports the outcome.
  //
  printHeading("PARTNER SIDE: Step 5 - Report the outcome to Parmana");

  const reported = refund
    ? await postJson(
        server.url,
        OUTCOMES_PATH,
        {
          decisionId: decision.decisionId,
          orderId: ORDER_ID,
          paymentId: PAYMENT_ID,
          amountInr: AMOUNT_INR,
          status: "refunded",
          refundId: refund.refundId,
        },
        "partner-a",
      )
    : undefined;

  if (reported) {
    console.log(`HTTP ${reported.status}`);
    print("Recorded outcome", reported.body);

    if (reported.status !== 201 || reported.body.status !== "refunded") {
      unexpected.push("outcome not recorded");
    }
  } else {
    unexpected.push("no refund to report");
  }

  //
  // Step 5 again: the partner reports the same outcome a second time. It is refused.
  //
  printHeading("PARTNER SIDE: Step 5 again - Report the same outcome twice");

  const repeated = refund
    ? await postJson(
        server.url,
        OUTCOMES_PATH,
        {
          decisionId: decision.decisionId,
          orderId: ORDER_ID,
          paymentId: PAYMENT_ID,
          amountInr: AMOUNT_INR,
          status: "refunded",
          refundId: refund.refundId,
        },
        "partner-a",
      )
    : undefined;

  if (repeated) {
    console.log(`HTTP ${repeated.status}`);
    print("Response body", repeated.body);

    if (repeated.status !== 409) {
      unexpected.push("repeated outcome not refused");
    }
  }

  //
  // Summary.
  //
  printHeading("Summary");

  console.log(
    [
      `Decision:  ${decision.decisionId} (${String(decision.outcome)}, limit INR ${decision.limitInr})`,
      `Refund:    ${refund ? refund.refundId + " (simulated)" : "none"}`,
      `Outcome:   ${reported ? `HTTP ${reported.status}, recorded` : "none"}`,
      `Repeat:    ${repeated ? `HTTP ${repeated.status}, ${String(repeated.body.error)}` : "none"}`,
      `Recorded outcomes held by Parmana: ${server.outcomes.size}`,
    ].join("\n"),
  );

  server.close();

  // npm run examples runs this file: fail it if any outcome changes.
  if (unexpected.length > 0) {
    throw new Error(`Unexpected outcome: ${unexpected.join("; ")}`);
  }

  console.log();
  console.log("Example Complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
