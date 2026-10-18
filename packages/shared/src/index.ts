/**
 * Shared Package
 *
 * Canonical public API.
 */

export * from "./domain/index.js";
export * from "./repositories/index.js";
export * from "./config/index.js";
export * from "./errors/index.js";
export * from "./gateway/index.js";
export * from "./types/Json.js";
export * from "./logging/Logger.js";

export { normalizePolicy } from "./utils/normalize-policy.js";

/**
 * External connector endpoint address checks (ADR-0013): used when an
 * endpoint is registered and again at every release.
 */
export * from "./network/externalEndpointAddress.js";
