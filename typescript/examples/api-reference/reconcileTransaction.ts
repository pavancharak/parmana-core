import { ParmanaClient } from "@parmana/sdk";

// Operator credentials only: a plain API key is refused with 403.
const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_OPERATOR_KEY!,
});

const result = await client.reconcileTransaction(
  "6f6582a1-4e1a-4800-a73b-cb4c3aa32110",
);

console.log(result.status, result.changed);
