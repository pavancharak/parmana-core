"""
Descriptive connector metadata: version, health, and registration-time
descriptive metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


@dataclass(frozen=True)
class ConnectorVersion:
    major: int
    minor: int
    patch: int


def format_connector_version(version: ConnectorVersion) -> str:
    return f"{version.major}.{version.minor}.{version.patch}"


def connector_versions_equal(a: ConnectorVersion, b: ConnectorVersion) -> bool:
    return a.major == b.major and a.minor == b.minor and a.patch == b.patch


class ConnectorHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class ConnectorHealth:
    """
    Point-in-time connector health.

    Purely descriptive/self-reported by the connector author at
    registration time in this package -- there is no background
    health-check poller.
    """

    status: ConnectorHealthStatus
    checked_at: str
    reason: str | None = None


def healthy_now() -> ConnectorHealth:
    return ConnectorHealth(
        status=ConnectorHealthStatus.HEALTHY,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


@dataclass(frozen=True)
class ConnectorMetadata:
    """
    Descriptive metadata about a registered connector.
    """

    connector_id: str
    display_name: str
    version: ConnectorVersion
    health: ConnectorHealth
    description: str | None = None
