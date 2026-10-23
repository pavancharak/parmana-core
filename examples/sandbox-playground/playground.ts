import {
  ParmanaClient,
  createBusinessTransaction,
  ExecutionRejectedError,
  verifyExecutionTrustRecordOffline,
} from "@parmana/sdk";

const PARMANA_URL = "https://parmana-sandbox.vercel.app";
const PARMANA_API_KEY = process.env.PARMANA_API_KEY; // the sandbox demo key
if (!PARMANA_API_KEY)
  throw new Error("Set PARMANA_API_KEY to the sandbox demo key.");

const client = new ParmanaClient({
  endpoint: PARMANA_URL,
  apiKey: PARMANA_API_KEY,
  timeout: 120_000,
});

// 1. Who am I? The demo key may ask for sandbox:receipt only.
const me = await client.caller();
console.log("1.", me.callerId, me.allowedCapabilities);

// 2. What must a request carry? Ask the server for the policy in effect.
const inEffect = await (
  await fetch(`${PARMANA_URL}/policies/in-effect?capability=sandbox:receipt`, {
    headers: { Authorization: `Bearer ${PARMANA_API_KEY}` },
  })
).json();
console.log("2.", inEffect.policy, inEffect.signals);

const target = `my-first-receipt-${Date.now()}`;
const request = (note: string, signals: Record<string, unknown>) =>
  createBusinessTransaction({
    principalId: me.callerId,
    purpose: "Trying the Parmana sandbox",
    action: "sandbox:receipt",
    target,
    parameters: { note },
    policy: inEffect.policy,
    signals: { note, ...signals } as never,
  });

// 3. Without an approval, the policy refuses.
try {
  await client.execute(request("hello", { receiptApproved: false }));
} catch (error) {
  if (!(error instanceof ExecutionRejectedError)) throw error;
  console.log("3. refused:", error.message);
}

// 4. Get a signed approval for this target from the sandbox's demo approver.
const approval = await (
  await fetch(`${PARMANA_URL}/sandbox/approvals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ capability: "sandbox:receipt", resourceId: target }),
  })
).json();
console.log("4. approval expires", approval.payload.expiresAt);

// 5. With the approval, the request is approved and released.
const record = await client.execute(
  request("hello", { receiptApproved: true, approvalArtifact: approval }),
);
console.log(
  "5.",
  record.executions[0]?.decision.outcome,
  record.businessTransactionId,
);

// 6. Verify the signed record offline, with the sandbox's public key only.
const { pem } = await client.publicKey("default");
console.log(
  "6. verifies offline:",
  verifyExecutionTrustRecordOffline(record, { default: pem }).valid,
);

// 7. The same approval again is refused: an approval is used once.
try {
  await client.execute(
    request("again", { receiptApproved: true, approvalArtifact: approval }),
  );
} catch (error) {
  if (!(error instanceof ExecutionRejectedError)) throw error;
  console.log("7. refused:", error.message);
}
