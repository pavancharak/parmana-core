import { HttpTransport, ParmanaClient } from "@parmana/sdk";

export function createClient() {
  return new ParmanaClient({
    endpoint: "http://localhost:3000",

    transport: new HttpTransport({
      endpoint: "http://localhost:3000",
    }),
  });
}
