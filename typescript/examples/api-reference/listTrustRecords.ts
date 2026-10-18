import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const records = await client.trustRecords(1, 25, {
  since: "2026-10-01T00:00:00Z",
});

console.log(records.length);
