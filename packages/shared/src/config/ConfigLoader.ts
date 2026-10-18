import { loadConfig } from "./Config.js";

/**
 * Returns the immutable Parmana configuration.
 */
export function getConfig() {
  return loadConfig();
}
