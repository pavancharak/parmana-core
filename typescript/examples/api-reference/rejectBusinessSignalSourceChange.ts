import { ParmanaClient, signPolicyChangeStepUp } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const stepUp = signPolicyChangeStepUp({
  pendingPolicyChangeId: "5ba7d3a6-d56d-4e90-b588-402d44aeee0c",
  action: "reject",
  privateKeyPem: readFileSync("step-up.private.pem", "utf8"),
  keyId: "checker-step-up-1",
});

const change = await client.rejectBusinessSignalSourceChange(
  "5ba7d3a6-d56d-4e90-b588-402d44aeee0c",
  "Register the ERP with its signing key.",
  stepUp,
);

console.log(change.status);
