import { HttpTransport, ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "http://localhost:3000",

  transport: new HttpTransport({
    endpoint: "http://localhost:3000",
  }),
});

const replay = await client.replay("550e8400-e29b-41d4-a716-446655440000");

console.log(JSON.stringify(replay, null, 2));
