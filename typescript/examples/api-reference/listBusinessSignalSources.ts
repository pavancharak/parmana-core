import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

for (const source of await client.businessSignalSources()) {
  console.log(source.name, source.status, source.endpointUrl);
}
