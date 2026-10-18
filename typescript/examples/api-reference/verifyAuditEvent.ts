import { ParmanaClient } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

// A signed audit event and its signature, as exported from caller_audit_events.
const { event, signature } = JSON.parse(
  readFileSync("audit-event.json", "utf8"),
);

const valid = await client.verifyAuditEvent(event, signature);

console.log(valid);
