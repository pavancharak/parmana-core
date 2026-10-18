import pytest
import responses

from parmana import (
    ConfigurationError,
    ConflictError,
    ExecutionTrustRecord,
    ParmanaClient,
    ParmanaHttpError,
)


def test_client_creation():
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    assert client.endpoint == "http://localhost:3000"


def test_client_creation_without_api_key_does_not_set_authorization():
    client = ParmanaClient(endpoint="http://localhost:3000")

    assert "Authorization" not in client._transport._session.headers


@responses.activate
def test_client_api_key_flows_through_to_every_request():
    """
    ParmanaClient(api_key=...) -> HttpTransport -> a real Authorization
    header on the wire, end to end through the public constructor, not
    just at the HttpTransport unit level.
    """
    responses.add(
        responses.GET,
        "http://localhost:3000/health",
        json={"status": "UP"},
        status=200,
    )

    client = ParmanaClient(
        endpoint="http://localhost:3000",
        api_key="my-secret-api-key",
    )

    client.execution.health()

    sent_request = responses.calls[0].request
    assert sent_request.headers["Authorization"] == "Bearer my-secret-api-key"


def test_models_and_errors_are_importable_from_top_level_package():
    """
    Regression test: errors were only importable via
    `parmana.errors.*`, not from the top-level `parmana` package, unlike
    models. `from parmana import ConflictError` previously raised
    ImportError.
    """

    assert issubclass(ConflictError, ParmanaHttpError)
    assert ExecutionTrustRecord is not None


@pytest.mark.parametrize("endpoint", ["", None])
def test_client_creation_without_endpoint_raises_configuration_error(endpoint):
    """
    Mirrors typescript/src/client/ParmanaClient.ts's identical
    fail-fast check: a missing Runtime endpoint must be rejected at
    construction, not surface later as a confusing connection failure.
    """

    with pytest.raises(ConfigurationError):
        ParmanaClient(endpoint=endpoint)


@responses.activate
def test_flat_client_methods_delegate_to_the_matching_nested_api():
    """
    docs/site/sdks/api-coverage.mdx, parity rules requires execute(), verify(),
    replay(), validatePolicy(), and health() directly on ParmanaClient,
    not only on nested API namespaces.
    """

    responses.add(
        responses.GET,
        "http://localhost:3000/health",
        json={"status": "UP"},
        status=200,
    )

    client = ParmanaClient(endpoint="http://localhost:3000")

    assert client.health() == {"status": "UP"}


@responses.activate
def test_replay_receipt_transactions_are_callable_and_still_navigable():
    """
    ReplayApi/ReceiptApi/TransactionApi are exposed on ParmanaClient
    under the same name as the operation itself (`client.replay`,
    `client.receipt`, `client.transactions`), so the flat
    docs/site/sdks/api-coverage.mdx, parity rules capability can't be a same-named
    method without shadowing the existing namespace object. Making each
    namespace object itself callable (__call__) satisfies both shapes
    at once -- this proves neither broke the other.
    """

    responses.add(
        responses.POST,
        "http://localhost:3000/replay",
        json={"businessTransactionId": "txn-1", "success": True, "mismatches": []},
        status=200,
    )
    responses.add(
        responses.GET,
        "http://localhost:3000/transactions?page=1&pageSize=25",
        json=[],
        status=200,
    )

    client = ParmanaClient(endpoint="http://localhost:3000")

    assert callable(client.replay)
    client.replay("txn-1")  # client.replay(id) -- the flat shape
    assert client.transactions() == []  # client.transactions() -- the flat shape
    assert hasattr(client.replay, "replay")  # client.replay.replay(id) still works
    # client.transactions.list(...) still works
    assert hasattr(client.transactions, "list")
