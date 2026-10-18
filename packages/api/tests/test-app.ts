import { createApplication } from "../src/application.js";
import { createApp } from "../src/app.js";
import { createExecutionSystem } from "../src/bootstrap/createExecutionSystem.js";

const executionSystem = await createExecutionSystem();

const application = createApplication(executionSystem);

const app = createApp(application, { callerAuth: "disabled" });

export default app;
