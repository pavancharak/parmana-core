import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

for (const grant of await client.authorityGrants()) {
  console.log(grant.callerId, grant.capability, grant.status, grant.validUntil);
}
