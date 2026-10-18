import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../../src/application.js";
import { createApp } from "../../../src/app.js";
import { createExecutionSystem } from "../../../src/bootstrap/createExecutionSystem.js";

async function buildApp() {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);
  return createApp(application, { callerAuth: "disabled" });
}

describe("GET /parmana-handbook.pdf", () => {
  it("serves the real PDF with no caller credential required", async () => {
    const app = await buildApp();

    const response = await request(app).get("/parmana-handbook.pdf");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body.length).toBeGreaterThan(100_000);
    expect(response.body.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
