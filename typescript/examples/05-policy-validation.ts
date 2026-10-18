import { HttpTransport, ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "http://localhost:3000",

  transport: new HttpTransport({
    endpoint: "http://localhost:3000",
  }),
});

const result = await client.validatePolicy("vendor-payment", "2.1.0");

console.log(JSON.stringify(result, null, 2));
