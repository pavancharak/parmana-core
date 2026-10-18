import { ParmanaClient } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const change = await client.proposeBusinessSignalSourceChange({
  action: "register",
  name: "erp",
  endpointUrl: "https://orders.example.com/parmana/signals",
  timeoutMs: 5000,
  publicKeyPem: readFileSync("erp-answers.public.pem", "utf8"),
  keyId: "erp-2026-10",
  reason: "Release goods only against invoices the ERP says are paid.",
});

console.log(change.changeId);
