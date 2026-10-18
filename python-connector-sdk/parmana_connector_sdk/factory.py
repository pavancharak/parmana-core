"""
Construction contract a connector factory can implement.
"""

from __future__ import annotations

from typing import Generic, Protocol, TypeVar

from .types import Connector

TConfig = TypeVar("TConfig", contravariant=True)


class ConnectorFactory(Protocol, Generic[TConfig]):
    """
    Constructs a Connector from configuration.

    No concrete factory ships in this package; only the seam is defined so
    connectors have a single, consistent construction contract to target.
    """

    connector_type: str

    def create(self, config: TConfig) -> Connector: ...
