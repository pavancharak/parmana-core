import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

// Replace the id with the businessTransactionId you declared.
const status = await client.transactionStatus(
  "6f6582a1-4e1a-4800-a73b-cb4c3aa32110",
  { history: true },
);

console.log(status.current.status, status.current.stage);

for (const event of status.history ?? []) {
  console.log(event.sequence, event.status, event.stage, event.occurredAt);
}
