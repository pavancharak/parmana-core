import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

for (const connector of await client.externalConnectors()) {
  console.log(connector.capability, connector.status, connector.endpointUrl);
}
