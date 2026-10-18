import { HttpTransport, ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "http://localhost:3000",

  transport: new HttpTransport({
    endpoint: "http://localhost:3000",
  }),
});

const health = await client.health();

console.log(health);
