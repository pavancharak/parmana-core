import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/logging/Logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits debug/info to stdout (console.log) and warn/error to stderr (console.error)", () => {
    const logger = createLogger("debug");

    logger.debug({ event: "a" });
    logger.info({ event: "b" });
    logger.warn({ event: "c" });
    logger.error({ event: "d" });

    expect(console.log).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("gates output below the configured level", () => {
    const logger = createLogger("warn");

    logger.debug({ event: "should-not-appear" });
    logger.info({ event: "should-not-appear" });
    logger.warn({ event: "should-appear" });
    logger.error({ event: "should-appear" });

    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("defaults to info level for an unrecognized LOG_LEVEL value", () => {
    const logger = createLogger("not-a-real-level");

    logger.debug({ event: "should-not-appear" });
    logger.info({ event: "should-appear" });

    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("emits a structured JSON line with level, timestamp, and call-site fields", () => {
    const logger = createLogger("info");

    logger.info({ event: "server_started", port: 3000 });

    const [line] = (console.log as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string];
    const parsed = JSON.parse(line);

    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("server_started");
    expect(parsed.port).toBe(3000);
    expect(typeof parsed.timestamp).toBe("string");
  });
});

describe("getLogger", () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  it("returns the same instance across calls and honors LOG_LEVEL from config", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "error";

    const module = await import("../../src/logging/Logger.js");

    const first = module.getLogger();
    const second = module.getLogger();
    expect(first).toBe(second);

    first.info({ event: "should-not-appear-at-error-level" });

    const loggedThisEvent = (
      console.log as ReturnType<typeof vi.fn>
    ).mock.calls.some(([line]) =>
      String(line).includes("should-not-appear-at-error-level"),
    );
    expect(loggedThisEvent).toBe(false);
  });
});
