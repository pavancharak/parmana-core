import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

for (const change of await client.externalConnectorChanges(
  "PENDING_APPROVAL",
)) {
  console.log(change.changeId, change.action, change.capability);
}
