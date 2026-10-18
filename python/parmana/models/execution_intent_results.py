"""
Parmana Execution Intent responses.

Hand-maintained: these are the response bodies of the /execution-intents
routes (packages/api/src/routes/execution-intents.ts), not named exports of
@parmana/shared, so python/scripts/generate_models.ts cannot generate them.
The intent and its status themselves ARE generated, in execution_intent.py.
"""

from __future__ import annotations

from dataclasses import dataclass

from .execution_intent import ExecutionIntent, ExecutionIntentStatus
from .trust_record import ExecutionTrustRecord


@dataclass(frozen=True)
class ExecutionIntentView:
    """
    An Execution Intent and its operational status.
    """

    intent: ExecutionIntent

    status: ExecutionIntentStatus


@dataclass(frozen=True)
class UnfinalizedExecutionIntents:
    """
    Intents that never reached a signed Trust Record and were not closed by
    hand, oldest first.
    """

    intents: list[ExecutionIntentView]


@dataclass(frozen=True)
class FinalizeExecutionIntentResult:
    """
    Result of finalizing an intent.

    `outcome` is "FINALIZED" when this call rebuilt the Trust Record, and
    "ALREADY_FINALIZED" when one already existed and nothing was built.
    """

    outcome: str

    business_transaction_id: str

    trust_record_id: str

    trust_record: ExecutionTrustRecord


@dataclass(frozen=True)
class ResolveExecutionIntentResult:
    """
    Result of closing an intent that an operator reconciled by hand.

    `outcome` is "RESOLVED" when this call closed the intent, and
    "ALREADY_RESOLVED" when it was already closed: nothing was changed, and
    `status` holds the ORIGINAL resolution, note and author.

    The resolution is an attributed operator statement in unsigned status. It
    is not tamper evident and it is not a Trust Record.
    """

    outcome: str

    business_transaction_id: str

    intent: ExecutionIntent

    status: ExecutionIntentStatus
