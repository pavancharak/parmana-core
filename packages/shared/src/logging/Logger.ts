import { loadConfig } from "../config/Config.js";

/**
 * Minimal structured logger, gating output on LOG_LEVEL
 * (config.logging.level, read in Config.ts).
 *
 * Closes a gap identified in the 2026-09-10 production-readiness pass:
 * LOG_LEVEL was already read into config, but nothing in the codebase
 * gated any output on it -- every console.* call site fired
 * unconditionally regardless of what LOG_LEVEL was set to, and log
 * shape was whatever each call site happened to pass (a bare string
 * here, a structured object there). This gives every call site a
 * shared, level-aware, structured shape without introducing an
 * external logging dependency.
 *
 * Deliberately NOT a wholesale replacement for every console.* call in
 * the codebase in one pass -- see the migrated call sites (this
 * package's own consumers in packages/api/src/bootstrap/) for the
 * pattern; remaining call sites can move to this incrementally.
 */

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

export type LogLevel = keyof typeof LEVELS;

function isLogLevel(value: string): value is LogLevel {
  return value in LEVELS;
}

/**
 * Resolves the configured minimum level. An unrecognized LOG_LEVEL
 * value (typo, stale config) falls back to "info" rather than
 * throwing -- logging configuration should never be able to crash
 * startup; getting the level wrong just means slightly wrong log
 * verbosity, not a refused boot.
 */
function resolveMinLevel(configuredLevel: string): LogLevel {
  return isLogLevel(configuredLevel) ? configuredLevel : "info";
}

export interface LogFields {
  readonly event: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}

/**
 * Creates a Logger gated on the given LOG_LEVEL string (pass
 * loadConfig().logging.level at the call site -- this function takes
 * the resolved string, not process.env, so it stays easy to test and
 * has no implicit dependency on when Config.ts's own env read runs).
 *
 * Output shape: one JSON object per line to stdout (debug/info) or
 * stderr (warn/error) -- level and a timestamp are added automatically,
 * `event` (required) and any additional fields come from the call
 * site, mirroring the { event: "...", ...details } shape most existing
 * console.warn/console.error call sites in this codebase already use
 * by convention, just enforced and level-gated here rather than ad hoc.
 */
export function createLogger(configuredLevel: string): Logger {
  const minLevel = LEVELS[resolveMinLevel(configuredLevel)];

  function log(level: LogLevel, fields: LogFields): void {
    if (LEVELS[level] < minLevel) {
      return;
    }

    const line = JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      ...fields,
    });

    if (LEVELS[level] >= LEVELS.warn) {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (fields) => log("debug", fields),
    info: (fields) => log("info", fields),
    warn: (fields) => log("warn", fields),
    error: (fields) => log("error", fields),
  };
}

let sharedLogger: Logger | undefined;

/**
 * Lazy, process-wide singleton Logger, built from loadConfig().logging.
 * level on first use -- the same lazy-singleton shape this codebase's
 * other composition roots already use (KeyBootstrap.create(),
 * CryptoBootstrap.create(), PostgresPoolFactory.create()). Exists so a
 * call site can log without threading a Logger instance through every
 * function signature between it and wherever the app is composed --
 * `import { getLogger } from "@parmana/shared"; getLogger().warn(...)`.
 *
 * loadConfig() itself is only called the first time a call site
 * actually logs (not merely by importing @parmana/shared), same as
 * every other lazy singleton in this file's neighborhood.
 */
export function getLogger(): Logger {
  if (!sharedLogger) {
    sharedLogger = createLogger(loadConfig().logging.level);
  }

  return sharedLogger;
}
