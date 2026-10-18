import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGracefulShutdown,
  type CloseableServer,
} from "../../../src/bootstrap/createGracefulShutdown.js";

function fakeServer(
  behavior: (callback: (error?: Error) => void) => void,
): CloseableServer & { closeCalls: number } {
  const server = {
    closeCalls: 0,
    close(callback: (error?: Error) => void) {
      server.closeCalls += 1;
      behavior(callback);
    },
  };
  return server;
}

describe("createGracefulShutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the server and exits 0 when close() succeeds", () => {
    const server = fakeServer((callback) => callback());
    const exit = vi.fn();
    const log = vi.fn();

    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: 10_000,
      exit,
      log,
    });
    shutdown("SIGTERM");

    expect(server.closeCalls).toBe(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("SIGTERM received"),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("closed cleanly"));
  });

  it("exits 1 when close() reports an error", () => {
    const server = fakeServer((callback) => callback(new Error("boom")));
    const exit = vi.fn();
    const logError = vi.fn();

    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: 10_000,
      exit,
      logError,
      log: vi.fn(),
    });
    shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("error while closing server"),
      expect.any(Error),
    );
  });

  it("is idempotent: a second signal while already shutting down never calls close() twice", () => {
    // close() never calls back in this case, simulating a still-draining server.
    const server = fakeServer(() => {});
    const exit = vi.fn();

    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: 10_000,
      exit,
      log: vi.fn(),
      logError: vi.fn(),
    });
    shutdown("SIGTERM");
    shutdown("SIGINT");

    expect(server.closeCalls).toBe(1);
  });

  it("force-exits 1 after the timeout when close() never calls back", () => {
    const server = fakeServer(() => {
      // Never calls back — simulates a request that hangs forever.
    });
    const exit = vi.fn();
    const logError = vi.fn();

    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: 5_000,
      exit,
      logError,
      log: vi.fn(),
    });
    shutdown("SIGTERM");

    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("timed out after 5000ms"),
    );
  });

  it("clears the force-exit timer once close() succeeds in time, so it never also force-exits later", () => {
    const server = fakeServer((callback) => callback());
    const exit = vi.fn();

    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: 5_000,
      exit,
      log: vi.fn(),
      logError: vi.fn(),
    });
    shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);

    vi.advanceTimersByTime(5_000);

    // Still exactly once: the force-exit timer was cleared, not just superseded.
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
