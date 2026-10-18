/**
 * Semantic connector version.
 */
export interface ConnectorVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function formatConnectorVersion(version: ConnectorVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function connectorVersionsEqual(
  a: ConnectorVersion,
  b: ConnectorVersion,
): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

export type ConnectorHealthStatus = "healthy" | "degraded" | "unavailable";

/**
 * Point-in-time connector health.
 *
 * Purely descriptive/self-reported by the connector author at registration
 * time in this milestone — there is no background health-check poller.
 */
export interface ConnectorHealth {
  readonly status: ConnectorHealthStatus;
  readonly checkedAt: string;
  readonly reason?: string;
}

export function healthyNow(): ConnectorHealth {
  return { status: "healthy", checkedAt: new Date().toISOString() };
}

/**
 * Descriptive metadata about a registered connector.
 */
export interface ConnectorMetadata {
  readonly connectorId: string;
  readonly displayName: string;
  readonly version: ConnectorVersion;
  readonly health: ConnectorHealth;
  readonly description?: string;
}
