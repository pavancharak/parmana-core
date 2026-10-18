"""
Parmana policy governance responses.

Hand-maintained: these are the response bodies of the
/policies/.../pending-changes routes (packages/api/src/routes/
pending-policy-changes.ts), which add fields to the generated
PendingPolicyChange (policy_change.py), so python/scripts/generate_models.ts
cannot generate them.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .policy_change import PendingPolicyChangeStatus


@dataclass(frozen=True)
class PolicyChangeDiff:
    """
    The content in effect now next to the proposed content.
    """

    #: None for a policy version that has no content in effect yet.
    current: Any

    proposed: Any


@dataclass(frozen=True)
class ProposedPolicyChange:
    """
    A proposal as returned when it is created, with any warnings the policy
    validator raised about it.
    """

    pending_policy_change_id: str

    policy_name: str

    policy_version: str

    proposed_content: Any

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    reason: str

    coverage_warnings: list[Any] | None = None

    rule_conflicts: list[Any] | None = None


@dataclass(frozen=True)
class PolicyChangeForReview:
    """
    A policy change as listed for review.
    """

    pending_policy_change_id: str

    policy_name: str

    policy_version: str

    proposed_content: Any

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    reason: str

    diff: PolicyChangeDiff

    resolved_by: str | None = None

    resolved_at: datetime | None = None

    rejection_reason: str | None = None

    coverage_warnings: list[Any] | None = None

    rule_conflicts: list[Any] | None = None
