import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const replay = await client.replay("5f0c2a7e-3d7b-4d0e-9a55-2f6d8b1c4e90");

console.log(replay);
