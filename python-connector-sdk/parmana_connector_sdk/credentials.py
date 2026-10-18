"""
Credential resolution seam.

Credential resolution happens exclusively inside the Execution Gateway (via a
CredentialVault backed by one of these providers). Connectors never resolve,
retrieve, discover, or store credentials themselves -- they only ever receive
an opaque, already-resolved CredentialHandle.

This module defines the interface seam for future providers (HashiCorp
Vault, AWS Secrets Manager, Azure Key Vault, Google Secret Manager). Only the
seam is defined here; no cloud SDK integration is implemented.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class CredentialHandle:
    """
    Opaque credential material resolved by a CredentialProvider.

    ``value`` is never logged, never included in connector evidence, and
    never serialized into an Execution Trust Record. It exists only to be
    read, ephemerally, by a Connector's own execution call (e.g. an HTTP
    header).
    """

    provider_id: str
    credential_id: str
    value: Any = field(repr=False)
    _branded: bool = field(default=False, repr=False, compare=False)


def brand_credential_handle(handle: CredentialHandle) -> CredentialHandle:
    """
    Marks a CredentialHandle as having been produced by a CredentialProvider,
    as opposed to a raw value supplied directly by a caller. Production
    connector executors reject any credential that is not branded this way,
    closing the "raw credential supplied" gap execution must fail closed on.
    """
    return replace(handle, _branded=True)


def is_credential_handle(value: object) -> bool:
    return isinstance(value, CredentialHandle) and value._branded


@runtime_checkable
class CredentialProvider(Protocol):
    """
    Resolves opaque credential material for a connector.

    Implementations MUST NOT raise errors that embed the resolved secret
    value -- only identifiers (connector_id, provider_id, credential_id) may
    appear in error messages.
    """

    provider_id: str

    def resolve(self, connector_id: str) -> CredentialHandle: ...


class EnvironmentCredentialProvider:
    """
    Resolves credentials from process environment variables.

    Future providers (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault,
    Google Secret Manager) implement the same CredentialProvider protocol.
    None is implemented in this package.
    """

    provider_id = "environment"

    def __init__(
        self,
        connector_environment_variable: Mapping[str, str],
        environment: Mapping[str, str | None] | None = None,
    ) -> None:
        self._connector_environment_variable = dict(connector_environment_variable)
        self._environment: Mapping[str, str | None] = (
            environment if environment is not None else os.environ
        )

    def resolve(self, connector_id: str) -> CredentialHandle:
        variable_name = self._connector_environment_variable.get(connector_id)
        if variable_name is None:
            raise ValueError(
                "No environment credential mapping configured for connector: "
                f"{connector_id}."
            )
        value = self._environment.get(variable_name)
        if value is None:
            raise ValueError(
                f'Environment variable "{variable_name}" for connector '
                f'"{connector_id}" is not set.'
            )
        return brand_credential_handle(
            CredentialHandle(
                provider_id=self.provider_id,
                credential_id=variable_name,
                value={"token": value},
            )
        )


class StaticCredentialProvider:
    """
    Resolves credentials from an in-memory map.

    Intended for hermetic tests and local development only.
    """

    provider_id = "static"

    def __init__(self, entries: Mapping[str, Any] | None = None) -> None:
        self._credentials: dict[str, Any] = dict(entries or {})

    def set(self, connector_id: str, value: Any) -> None:
        self._credentials[connector_id] = value

    def resolve(self, connector_id: str) -> CredentialHandle:
        if connector_id not in self._credentials:
            raise ValueError(
                f"No static credential configured for connector: {connector_id}."
            )
        return brand_credential_handle(
            CredentialHandle(
                provider_id=self.provider_id,
                credential_id=connector_id,
                value=self._credentials[connector_id],
            )
        )
