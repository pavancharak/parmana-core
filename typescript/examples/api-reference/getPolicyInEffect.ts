import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const inEffect = await client.policyInEffect("paytm:refund");

console.log(inEffect.policy, inEffect.signals.approval);
