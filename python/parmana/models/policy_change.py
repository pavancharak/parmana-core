"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/pending-policy-change.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class PendingPolicyChangeStatus(str, Enum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


@dataclass(frozen=True)
class PendingPolicyChange:
    pending_policy_change_id: str

    policy_name: str

    policy_version: str

    proposed_content: Any

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    reason: str

    resolved_by: str | None = None

    resolved_at: datetime | None = None

    rejection_reason: str | None = None
