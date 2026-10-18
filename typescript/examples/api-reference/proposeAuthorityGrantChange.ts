import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const change = await client.proposeAuthorityGrantChange({
  action: "grant",
  callerId: "warehouse-agent",
  capability: "erp:release-goods",
  limits: {
    "parameters.amount": { max: 100000 },
    "parameters.currency": { oneOf: ["INR"] },
  },
  validUntil: "2026-12-30T00:00:00.000Z",
  reason:
    "The warehouse agent releases goods for paid invoices up to 100000 INR this quarter.",
});

console.log(change.changeId);
