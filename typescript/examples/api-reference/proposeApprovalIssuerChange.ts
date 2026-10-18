import { ParmanaClient } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const change = await client.proposeApproverChange({
  action: "add",
  approverId: "manager-priya",
  keyId: "manager-priya-key-1",
  publicKeyPem: readFileSync(
    "manager-priya__manager-priya-key-1.public.pem",
    "utf8",
  ),
  reason: "Priya approves refunds for the West region from October.",
});

console.log(change.changeId);
