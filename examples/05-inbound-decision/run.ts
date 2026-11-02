import { print, printHeading } from "../shared/helpers/print.js";
import {
  AUDIENCE,
  postJson,
  startInboundServer,
  verifyDecision,
  type IssuedDecision,
} from "../shared/helpers/inbound-server.js";

//
// RFC-0025, step 1: Parmana issues a signed decision for an inbound refund request.
//
// A partner's agent asks Parmana whether it may refund an amount for a payment. Parmana
// approves an amount within the partner's granted limit, rejects anything above it with the
// reason approval_required, and signs every decision it issues. A partner that will not
// refund without a valid signature has no way to refund past the limit.
//
// This example runs the real inbound decision route from packages/api. Stores and the
// signing key are in memory, so nothing is persisted.
//

const PATH = "/v1/inbound/decisions";

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" Parmana Example 05 - Inbound Decision");
  console.log("========================================");

  printHeading("PARMANA SIDE: Start the inbound decision route");

  const server = await startInboundServer({ "partner-a": 1000 });

  console.log(`Listening on ${server.url}`);
  console.log(
    "partner-a holds an active inbound:refund grant with a limit of INR 1000.",
  );
  console.log("partner-b holds no grant.");

  const unexpected: string[] = [];

  //
  // Scenario 1: an amount within the limit is approved and signed.
  //
  printHeading("PARTNER SIDE: Scenario 1 - Refund within the limit");

  const approved = await postJson(
    server.url,
    PATH,
    { paymentId: "pay_1001", amountInr: 500, audience: AUDIENCE },
    "partner-a",
  );

  console.log(`HTTP ${approved.status}`);
  print("Decision", approved.body);

  const approvedDecision = approved.body as unknown as IssuedDecision;

  if (approved.status !== 201 || approvedDecision.outcome !== "approved") {
    unexpected.push("1 not approved");
  } else if (!verifyDecision(server.publicKey, approvedDecision)) {
    unexpected.push("1 signature does not verify");
  }

  //
  // Scenario 2: an amount above the limit is rejected, with the reason. The rejection is signed
  // and stored too, so the refusal can be shown later.
  //
  printHeading("PARTNER SIDE: Scenario 2 - Refund above the limit");

  const rejected = await postJson(
    server.url,
    PATH,
    { paymentId: "pay_1002", amountInr: 1500, audience: AUDIENCE },
    "partner-a",
  );

  console.log(`HTTP ${rejected.status}`);
  print("Decision", rejected.body);

  if (
    rejected.status !== 201 ||
    rejected.body.outcome !== "rejected" ||
    rejected.body.reason !== "approval_required"
  ) {
    unexpected.push("2 not rejected for approval");
  }

  //
  // Scenario 3: a partner with no grant gets no decision at all.
  //
  printHeading("PARTNER SIDE: Scenario 3 - Partner with no grant");

  const noGrant = await postJson(
    server.url,
    PATH,
    { paymentId: "pay_1003", amountInr: 500, audience: AUDIENCE },
    "partner-b",
  );

  console.log(`HTTP ${noGrant.status}`);
  print("Response body", noGrant.body);

  if (noGrant.status !== 403 || noGrant.body.error !== "no_active_grant") {
    unexpected.push("3 not refused for no grant");
  }

  //
  // Scenario 4: a partner that raises the limit on a decision it received. The signature no
  // longer matches, so the change is detected before the partner refunds.
  //
  printHeading("PARTNER SIDE: Scenario 4 - Decision altered after issue");

  const altered: IssuedDecision = { ...approvedDecision, limitInr: 100_000 };
  const alteredValid = verifyDecision(server.publicKey, altered);

  console.log(
    `limitInr changed from ${approvedDecision.limitInr} to ${altered.limitInr}`,
  );
  console.log(`Signature still valid: ${alteredValid}`);

  if (alteredValid) {
    unexpected.push("4 altered decision still verifies");
  }

  //
  // Scenario 5: a request with no caller identity is refused. Caller auth sets the identity in
  // production; without it, the route cannot decide anything.
  //
  printHeading("PARTNER SIDE: Scenario 5 - Request with no caller identity");

  const anonymous = await postJson(server.url, PATH, {
    paymentId: "pay_1004",
    amountInr: 500,
    audience: AUDIENCE,
  });

  console.log(`HTTP ${anonymous.status}`);
  print("Response body", anonymous.body);

  if (anonymous.status !== 401) {
    unexpected.push("5 anonymous request not refused");
  }

  //
  // Summary.
  //
  printHeading("Summary");

  console.log(
    [
      `1. Within limit (INR 500)     -> HTTP ${approved.status}, ${String(approved.body.outcome)}`,
      `2. Above limit (INR 1500)     -> HTTP ${rejected.status}, ${String(rejected.body.reason)}`,
      `3. No grant                   -> HTTP ${noGrant.status}, ${String(noGrant.body.error)}`,
      `4. Altered decision           -> signature valid: ${alteredValid}`,
      `5. No caller identity         -> HTTP ${anonymous.status}`,
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
