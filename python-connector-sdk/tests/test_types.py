"""
connector_capabilities() validation unit tests.
"""

from __future__ import annotations

import pytest

from parmana_connector_sdk import connector_capabilities, is_namespaced_capability


def test_accepts_well_formed_namespaced_capabilities() -> None:
    capabilities = connector_capabilities(["crm:read", "billing:issue-refund"])
    assert capabilities.includes("crm:read")
    assert capabilities.includes("billing:issue-refund")
    assert not capabilities.includes("crm:write")


def test_rejects_a_bare_action_with_no_namespace() -> None:
    with pytest.raises(
        ValueError, match="Connector capability must be a namespaced verb"
    ):
        connector_capabilities(["read"])


@pytest.mark.parametrize(
    "value,expected",
    [
        ("http:get", True),
        ("crm:read", True),
        ("billing:issue-refund", True),
        ("read", False),
        (":read", False),
        ("crm:", False),
        ("CRM:read", False),
    ],
)
def test_is_namespaced_capability(value: str, expected: bool) -> None:
    assert is_namespaced_capability(value) is expected
