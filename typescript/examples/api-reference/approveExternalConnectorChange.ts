import { ParmanaClient, signPolicyChangeStepUp } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const stepUp = signPolicyChangeStepUp({
  pendingPolicyChangeId: "ba7c5827-5844-4069-94fc-9b438ef08f78",
  action: "approve",
  privateKeyPem: readFileSync("step-up.private.pem", "utf8"),
  keyId: "checker-step-up-1",
});

const change = await client.approveExternalConnectorChange(
  "ba7c5827-5844-4069-94fc-9b438ef08f78",
  stepUp,
);

console.log(change.status);
