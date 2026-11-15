"""
Transaction status (decision D23): response types for the declare, execute,
status and reconcile routes.

Hand-written, not generated: they mirror the JSON the API returns. The
statuses and stages are kept as plain strings, so a status added by a later
version of the API still decodes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class TransactionStatusEvent:
    """One append-only status event of a Business Transaction."""

    event_id: str
    business_transaction_id: str
    sequence: int
    status: str
    stage: str
    occurred_at: datetime
    legacy: bool
    record_ref: str | None = None
    reason: str | None = None


@dataclass(frozen=True)
class DeclaredTransaction:
    """The response of POST /transactions (declare)."""

    business_transaction_id: str
    status: str
    transaction: dict[str, Any]
    accepted_at: datetime | None = None


@dataclass(frozen=True)
class TransactionStatusResult:
    """The response of GET /transactions/{id}/status."""

    business_transaction_id: str
    current: TransactionStatusEvent
    history: list[TransactionStatusEvent] | None = None


@dataclass(frozen=True)
class ReconcileResult:
    """The response of POST /transactions/{id}/reconcile."""

    business_transaction_id: str
    changed: bool
    status: str
