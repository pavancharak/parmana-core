import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const change = await client.proposeExternalConnectorChange({
  action: "register",
  capability: "erp:create-invoice",
  endpointUrl: "https://erp.example.com/parmana/release",
  policy: "erp-invoice",
  allowedParameters: ["amount", "currency"],
  timeoutMs: 10000,
  reason: "Finance creates invoices in the ERP through Parmana.",
});

console.log(change.changeId);
