/**
 * Local mode: the only way to relax a production refusal.
 *
 * Several bootstrap checks used to decide relaxation from NODE_ENV alone.
 * A single misconfigured variable (NODE_ENV=test on a real server) then
 * switched off replay protection, execution intents, signing readiness and
 * caller authentication at once. That is fail-open by configuration.
 *
 * Local mode now needs two independent, deliberate conditions:
 *
 *   1. PARMANA_LOCAL_MODE=true, set on purpose by the developer or the test
 *      setup; and
 *   2. NODE_ENV exactly "test" or "development".
 *
 * NODE_ENV alone never relaxes anything. If the flag is set while NODE_ENV is
 * anything else, local mode is off (every check is enforced), and
 * assertLocalModeConfigured() makes startup refuse with a named error, so a
 * misconfigured server does not start quietly in the wrong mode.
 */
export const LOCAL_MODE_VARIABLE = "PARMANA_LOCAL_MODE";

const LOCAL_NODE_ENVS: readonly string[] = ["test", "development"];

/**
 * True only when local mode is requested and NODE_ENV allows it. Every
 * other combination returns false, which enforces every check (fail closed).
 */
export function localModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[LOCAL_MODE_VARIABLE] !== "true") {
    return false;
  }

  return env.NODE_ENV !== undefined && LOCAL_NODE_ENVS.includes(env.NODE_ENV);
}

/**
 * Refuses to start when local mode is requested under a NODE_ENV that does
 * not allow it. Called once at startup, so the misconfiguration is visible
 * and does not run silently in enforcement mode.
 */
export function assertLocalModeConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env[LOCAL_MODE_VARIABLE] !== "true" || localModeEnabled(env)) {
    return;
  }

  throw new Error(
    `${LOCAL_MODE_VARIABLE}=true is refused unless NODE_ENV is exactly "test" ` +
      `or "development" (NODE_ENV is ${JSON.stringify(env.NODE_ENV ?? null)}). ` +
      "Local mode is for development and tests only. Remove " +
      `${LOCAL_MODE_VARIABLE} from this environment.`,
  );
}
