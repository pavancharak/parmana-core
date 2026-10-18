import { ParmanaClient, signPolicyChangeStepUp } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const stepUp = signPolicyChangeStepUp({
  pendingPolicyChangeId: "9f3cf733-a8ed-487c-bb58-a53950388cdf",
  action: "approve",
  privateKeyPem: readFileSync("step-up.private.pem", "utf8"),
  keyId: "checker-step-up-1",
});

const change = await client.approveAuthorityGrantChange(
  "9f3cf733-a8ed-487c-bb58-a53950388cdf",
  stepUp,
);

console.log(change.status);
