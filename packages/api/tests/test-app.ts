import { createApplication } from "../src/application.js";
import { createApp } from "../src/app.js";
import { createExecutionSystem } from "../src/bootstrap/createExecutionSystem.js";
import { createTrustedFacts } from "./helpers/trusted-facts.js";
const trustedFacts = createTrustedFacts();

const executionSystem = await createExecutionSystem();

const application = createApplication(
  executionSystem,
  undefined,
  undefined,
  undefined,
  trustedFacts.registry,
);

const app = createApp(application, { callerAuth: "disabled" });

export default app;
