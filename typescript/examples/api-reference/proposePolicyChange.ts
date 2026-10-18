import { ParmanaClient } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const change = await client.proposePolicyChange("customer-refund", "1.3.0", {
  reason: "Raise the maximum refund to 150000.",
  proposedContent: JSON.parse(
    readFileSync("policies/customer-refund/1.3.0/policy.json", "utf8"),
  ),
});

console.log(change.pendingPolicyChangeId);
