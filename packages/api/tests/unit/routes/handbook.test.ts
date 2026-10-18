import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../../src/application.js";
import { createApp } from "../../../src/app.js";
import { createExecutionSystem } from "../../../src/bootstrap/createExecutionSystem.js";

const PDF_URL = "https://parmana-api-real.vercel.app/parmana-handbook.pdf";

async function buildApp() {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);
  return createApp(application, { callerAuth: "disabled" });
}

describe("GET /handbook/download-leads", () => {
  it("captures a valid email and redirects straight to the PDF, no client JS required", async () => {
    const app = await buildApp();

    const response = await request(app)
      .get("/handbook/download-leads")
      .query({ email: "reader@example.com" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(PDF_URL);
  });

  it("rejects a missing email with 400 instead of redirecting", async () => {
    const app = await buildApp();

    const response = await request(app).get("/handbook/download-leads");

    expect(response.status).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });

  it("rejects a malformed email with 400 instead of redirecting", async () => {
    const app = await buildApp();

    const response = await request(app)
      .get("/handbook/download-leads")
      .query({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });
});

describe("POST /handbook/download-leads", () => {
  it("captures a valid email and returns a download URL, with no caller credential required", async () => {
    const app = await buildApp();

    const response = await request(app)
      .post("/handbook/download-leads")
      .send({ email: "reader@example.com" });

    expect(response.status).toBe(201);
    expect(response.body.downloadUrl).toBe(PDF_URL);
  });

  it("rejects a missing email with 400", async () => {
    const app = await buildApp();

    const response = await request(app)
      .post("/handbook/download-leads")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("email");
  });

  it("rejects a malformed email with 400", async () => {
    const app = await buildApp();

    const response = await request(app)
      .post("/handbook/download-leads")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("email");
  });
});

describe("handbook email check", () => {
  // CodeQL js/polynomial-redos: the old pattern took quadratic time on
  // long input. These pin the accepted shapes and the length cap.
  for (const email of ["reader@example.com", "a.b+tag@mail.example.co.uk"]) {
    it(`accepts ${email}`, async () => {
      const response = await request(await buildApp())
        .post("/handbook/download-leads")
        .send({ email });

      expect(response.status).toBe(201);
    });
  }

  for (const email of [
    "reader@example",
    "reader@example.",
    "reader@.example.com",
    "reader@example..com",
    `${"a".repeat(250)}@example.com`,
  ]) {
    it(`rejects ${JSON.stringify(email.length > 40 ? `${email.slice(0, 12)}... (${email.length} chars)` : email)}`, async () => {
      const response = await request(await buildApp())
        .post("/handbook/download-leads")
        .send({ email });

      expect(response.status).toBe(400);
    });
  }

  it("answers quickly on a long hostile input", async () => {
    const started = Date.now();
    const response = await request(await buildApp())
      .post("/handbook/download-leads")
      .send({ email: `a@${"a.".repeat(5000)}` });

    expect(response.status).toBe(400);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
