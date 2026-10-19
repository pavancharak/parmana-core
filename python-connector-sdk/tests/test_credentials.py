"""
CredentialProvider unit tests.
"""

from __future__ import annotations

import pytest

from parmana_connector_sdk import (
    EnvironmentCredentialProvider,
    StaticCredentialProvider,
    brand_credential_handle,
    is_credential_handle,
)
from parmana_connector_sdk.credentials import CredentialHandle


class TestStaticCredentialProvider:
    def test_resolves_a_configured_credential_as_a_branded_handle(self) -> None:
        provider = StaticCredentialProvider({"stripe": {"api_key": "fake_key_secret"}})
        handle = provider.resolve("stripe")
        assert is_credential_handle(handle)
        assert handle.provider_id == "static"
        assert handle.value == {"api_key": "fake_key_secret"}

    def test_rejects_unknown_connectors_without_ever_mentioning_credential_material(
        self,
    ) -> None:
        provider = StaticCredentialProvider({"stripe": {"api_key": "fake_key_secret"}})
        with pytest.raises(
            ValueError, match="No static credential configured for connector: sap."
        ):
            provider.resolve("sap")

    def test_supports_late_registration_via_set(self) -> None:
        provider = StaticCredentialProvider()
        provider.set("stripe", {"api_key": "fake_key_secret"})
        handle = provider.resolve("stripe")
        assert handle.value == {"api_key": "fake_key_secret"}


class TestEnvironmentCredentialProvider:
    def test_resolves_from_the_supplied_environment_map(self) -> None:
        provider = EnvironmentCredentialProvider(
            {"stripe": "STRIPE_API_KEY"}, {"STRIPE_API_KEY": "fake_key_from_env"}
        )
        handle = provider.resolve("stripe")
        assert is_credential_handle(handle)
        assert handle.value == {"token": "fake_key_from_env"}

    def test_rejects_a_connector_with_no_configured_mapping(self) -> None:
        provider = EnvironmentCredentialProvider({}, {})
        with pytest.raises(
            ValueError,
            match="No environment credential mapping configured for connector: stripe.",
        ):
            provider.resolve("stripe")

    def test_rejects_a_mapped_but_unset_env_var_without_leaking_any_value(
        self,
    ) -> None:
        provider = EnvironmentCredentialProvider({"stripe": "STRIPE_API_KEY"}, {})
        with pytest.raises(
            ValueError,
            match=(
                'Environment variable "STRIPE_API_KEY" for connector "stripe" '
                "is not set."
            ),
        ):
            provider.resolve("stripe")

    def test_never_leaks_an_unrelated_connectors_secret_in_a_resolution_failure(
        self,
    ) -> None:
        provider = EnvironmentCredentialProvider(
            {"stripe": "STRIPE_API_KEY"},
            {
                "STRIPE_API_KEY": "fake_key_super_secret",
                "SAP_API_KEY": "sap_super_secret",
            },
        )
        # "sap" has no mapping configured; the failure message must name only
        # identifiers (connector_id, variable name) -- never any secret value
        # present anywhere in the environment.
        with pytest.raises(ValueError) as exc_info:
            provider.resolve("sap")
        message = str(exc_info.value)
        assert "fake_key_super_secret" not in message
        assert "sap_super_secret" not in message


class TestCredentialHandleBranding:
    def test_only_recognizes_handles_produced_via_brand_credential_handle(
        self,
    ) -> None:
        raw = CredentialHandle(
            provider_id="static", credential_id="stripe", value="fake_key_secret"
        )
        assert is_credential_handle(raw) is False
        assert is_credential_handle(brand_credential_handle(raw)) is True
        assert is_credential_handle("fake_key_secret") is False
        assert is_credential_handle(None) is False
