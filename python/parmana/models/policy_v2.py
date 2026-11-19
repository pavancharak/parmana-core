"""
Parmana policy version 2 models.

Hand-maintained: the response bodies of the /v2/decisions and /v2/reviews
routes (packages/api/src/routes/policy-v2-decisions.ts and
policy-v2-reviews.ts). They mirror the TypeScript SDK's policy-v2 models.

Policy version 2 is not enabled on every deployment: a call for a capability
the deployment has not enabled is refused with HTTP 404 and the error code
not_enabled.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PolicyV2ValidationError:
    """
    One failed check of a policy, as the policy validator reports it.
    """

    #: The check number in the policy version 2 specification. 0 means structure.
    check: int

    path: str

    message: str


@dataclass(frozen=True)
class PolicyV2Refusal:
    """
    A refusal that happens before any rule runs. It refuses the request.

    code is one of NO_APPROVED_POLICY, POLICY_INVALID, SOURCE_UNAVAILABLE,
    SOURCE_NOT_VERIFIED, STALE, INVALID, MISSING_VALUE or THRESHOLD_NOT_APPROVED.
    """

    code: str

    detail: str

    errors: list[PolicyV2ValidationError] | None = None


@dataclass(frozen=True)
class PolicyV2Decision:
    """
    The recorded decision. released is always False: a policy version 2
    decision never releases anything by itself.

    outcome is APPROVE, REJECT or REVIEW. A REVIEW outcome carries review_id;
    read the review with PolicyV2Api.review until it is final.
    """

    outcome: str

    reason: str

    record_id: str

    released: bool

    tier: str | None = None

    refusal: PolicyV2Refusal | None = None

    review_id: str | None = None


@dataclass(frozen=True)
class PolicyV2ReviewView:
    """
    A review item as its requester sees it.

    status is pending, approved, refused or expired.
    """

    status: str

    reason_code: str


@dataclass(frozen=True)
class PolicyV2ReviewDecision:
    """
    The result of a reviewer's decision. outcome is APPROVED or REFUSED once
    the review is final, and None before that.
    """

    item_id: str

    status: str

    final: bool

    decisions_recorded: int

    outcome: str | None = None


@dataclass(frozen=True)
class PolicyV2ReplayResult:
    """
    The result of replaying a recorded decision from its evidence record.

    reproduced is True when the replay gives the same outcome and inputs. differences lists what
    did not match. replayed is the decision the replay produced, as a mapping: its fields are those
    of the evidence record, which the SDK does not type further.
    """

    reproduced: bool

    differences: list[str]

    replayed: dict[str, Any] | None = None
