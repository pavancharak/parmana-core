/**
 * The minimal shape createGracefulShutdown needs from an HTTP server —
 * matches http.Server.close's signature exactly, but kept narrow so
 * tests can pass a fake without constructing a real server/socket.
 */
export interface CloseableServer {
  close(callback: (error?: Error) => void): void;
}

export interface GracefulShutdownOptions {
  readonly server: CloseableServer;
  readonly timeoutMs: number;
  /** Defaults to process.exit. Injectable so tests never actually exit the test process. */
  readonly exit?: (code: number) => void;
  readonly log?: (message: string) => void;
  readonly logError?: (message: string, error?: unknown) => void;
}

/**
 * Builds a SIGTERM/SIGINT handler: stop accepting new connections, let
 * in-flight requests finish via the server's own close() semantics,
 * then exit — the standard "drain, don't drop" shape a PaaS
 * orchestrator expects before it force-kills the container. A hard
 * timeout guards against a request that never completes (e.g. a hung
 * downstream call to Supabase) blocking shutdown forever;
 * the platform's own kill timeout (usually longer) would eventually
 * SIGKILL the process anyway, but exiting cleanly on our own terms
 * first avoids depending on that.
 *
 * Idempotent: a second signal while already shutting down is a no-op,
 * not a second close() call racing the first.
 */
export function createGracefulShutdown(
  options: GracefulShutdownOptions,
): (signal: string) => void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;

  let shuttingDown = false;

  return function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;

    log(
      `[SHUTDOWN] ${signal} received: closing server (no new connections; in-flight requests finish)`,
    );

    const forceExit = setTimeout(() => {
      logError(
        `[SHUTDOWN] timed out after ${options.timeoutMs}ms; forcing exit`,
      );
      exit(1);
    }, options.timeoutMs);
    forceExit.unref?.();

    options.server.close((error) => {
      clearTimeout(forceExit);

      if (error) {
        logError("[SHUTDOWN] error while closing server:", error);
        exit(1);
        return;
      }

      log("[SHUTDOWN] server closed cleanly, exiting");
      exit(0);
    });
  };
}
