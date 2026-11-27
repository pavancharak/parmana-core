import "dotenv/config";

import { startServer } from "./startServer.js";

// The entry point: `npm run dev`, the Docker image and the load test run this file. Test code that needs
// a different signal source calls startServer directly.
await startServer();
