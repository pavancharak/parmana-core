import { print, printHeading } from "../shared/helpers/print.js";
import {
  AUDIENCE,
  postJson,
  startInboundServer,
  type IssuedDecision,
} from "../shared/helpers/inbound-server.js";

//
// RFC-0025, step 2: the partner reports what happened to a refund.
//
// After Parmana issues a decision, the partner refunds (or not) and reports the outcome. Parmana
// accepts a report only for a decision that exists, from the partner it was issued to, with the
// same payment and an amount within the limit. Each decision takes one outcome, so a repeated
// report is refused.
//
// This example runs the real inbound outcome route from packages/api, with in-memory stores.
//

const DECISIONS_PATH = "/v1/inbound/decisions";
const OUTCOMES_PATH = "/v1/inbound/outcomes";

async function issueDecision(
  url: string,
  partnerId: string,
  paymentId: string,
  amountInr: number,
): Promise<IssuedDecision> {
  const response = await postJson(
    url,
    DECISIONS_PATH,
    { paymentId, amountInr, audience: AUDIENCE },
    partnerId,
  );

  if (response.status !== 201 || response.body.outcome !== "approved") {
    throw new Error(
      `Setup failed: decision for ${paymentId} was not approved (HTTP ${response.status}).`,
    );
  }

  return response.body as unknown as IssuedDecision;
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" Parmana Example 06 - Inbound Outcome");
  console.log("========================================");

  printHeading("PARMANA SIDE: Start the inbound routes");

  const server = await startInboundServer({ "partner-a": 1000 });

  console.log(`Listening on ${server.url}`);
  console.log("partner-a holds an active grant with a limit of INR 1000.");
  console.log(
    "partner-b holds no grant. Outcome reports need no grant; they need a decision.",
  );

  const unexpected: string[] = [];

  printHeading("PARTNER SIDE: Issue a decision to report against");

  const decision = await issueDecision(
    server.url,
    "partner-a",
    "pay_2001",
    500,
  );

  console.log(
    `Decision ${decision.decisionId} for pay_2001, INR 500, approved.`,
  );

  //
  // Scenario 1: the partner reports a successful refund.
  //
  printHeading("PARTNER SIDE: Scenario 1 - Report a successful refund");

  const refunded = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: decision.decisionId,
      orderId: "ORD-2001",
      paymentId: "pay_2001",
      amountInr: 500,
      status: "refunded",
      refundId: "rfnd_example_2001",
    },
    "partner-a",
  );

  console.log(`HTTP ${refunded.status}`);
  print("Recorded outcome", refunded.body);

  if (refunded.status !== 201 || refunded.body.status !== "refunded") {
    unexpected.push("1 outcome not recorded");
  }

  //
  // Scenario 2: the same decision reported again is refused. One outcome per decision.
  //
  printHeading("PARTNER SIDE: Scenario 2 - Report the same decision again");

  const repeated = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: decision.decisionId,
      orderId: "ORD-2001",
      paymentId: "pay_2001",
      amountInr: 500,
      status: "refunded",
      refundId: "rfnd_example_2001",
    },
    "partner-a",
  );

  console.log(`HTTP ${repeated.status}`);
  print("Response body", repeated.body);

  if (
    repeated.status !== 409 ||
    repeated.body.error !== "outcome_already_recorded"
  ) {
    unexpected.push("2 repeat not refused");
  }

  //
  // Scenario 3: a report for a decision Parmana never issued is refused.
  //
  printHeading("PARTNER SIDE: Scenario 3 - Report for an unknown decision");

  const unknown = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: "dec-does-not-exist",
      orderId: "ORD-2002",
      paymentId: "pay_2002",
      amountInr: 500,
      status: "refunded",
      refundId: "rfnd_example_2002",
    },
    "partner-a",
  );

  console.log(`HTTP ${unknown.status}`);
  print("Response body", unknown.body);

  if (unknown.status !== 404 || unknown.body.error !== "decision_not_found") {
    unexpected.push("3 unknown decision not refused");
  }

  //
  // Scenario 4: a different partner reports against partner-a's decision.
  //
  printHeading(
    "PARTNER SIDE: Scenario 4 - Another partner reports the decision",
  );

  const otherPartner = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: decision.decisionId,
      orderId: "ORD-2003",
      paymentId: "pay_2001",
      amountInr: 500,
      status: "refunded",
      refundId: "rfnd_example_2003",
    },
    "partner-b",
  );

  console.log(`HTTP ${otherPartner.status}`);
  print("Response body", otherPartner.body);

  if (
    otherPartner.status !== 403 ||
    otherPartner.body.error !== "not_your_decision"
  ) {
    unexpected.push("4 other partner's report not refused");
  }

  //
  // Scenarios 5 and 6 use a second decision. Both reports are refused before anything is stored,
  // so the decision stays free for a correct report.
  //
  const second = await issueDecision(server.url, "partner-a", "pay_2002", 500);

  //
  // Scenario 5: a report naming a different payment than the decision.
  //
  printHeading("PARTNER SIDE: Scenario 5 - Report names a different payment");

  const wrongPayment = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: second.decisionId,
      orderId: "ORD-2004",
      paymentId: "pay_9999",
      amountInr: 500,
      status: "refunded",
      refundId: "rfnd_example_2004",
    },
    "partner-a",
  );

  console.log(`HTTP ${wrongPayment.status}`);
  print("Response body", wrongPayment.body);

  if (
    wrongPayment.status !== 422 ||
    wrongPayment.body.error !== "payment_mismatch"
  ) {
    unexpected.push("5 payment mismatch not refused");
  }

  //
  // Scenario 6: a report for more than the decision's limit.
  //
  printHeading("PARTNER SIDE: Scenario 6 - Report above the decision's limit");

  const overLimit = await postJson(
    server.url,
    OUTCOMES_PATH,
    {
      decisionId: second.decisionId,
      orderId: "ORD-2005",
      paymentId: "pay_2002",
      amountInr: 1500,
      status: "refunded",
      refundId: "rfnd_example_2005",
    },
    "partner-a",
  );

  console.log(`HTTP ${overLimit.status}`);
  print("Response body", overLimit.body);

  if (
    overLimit.status !== 422 ||
    overLimit.body.error !== "amount_exceeds_limit"
  ) {
    unexpected.push("6 over-limit report not refused");
  }

  //
  // Summary.
  //
  printHeading("Summary");

  console.log(
    [
      `1. Successful refund          -> HTTP ${refunded.status}, recorded`,
      `2. Same decision again        -> HTTP ${repeated.status}, ${String(repeated.body.error)}`,
      `3. Unknown decision           -> HTTP ${unknown.status}, ${String(unknown.body.error)}`,
      `4. Another partner's decision -> HTTP ${otherPartner.status}, ${String(otherPartner.body.error)}`,
      `5. Different payment          -> HTTP ${wrongPayment.status}, ${String(wrongPayment.body.error)}`,
      `6. Above the limit            -> HTTP ${overLimit.status}, ${String(overLimit.body.error)}`,
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
