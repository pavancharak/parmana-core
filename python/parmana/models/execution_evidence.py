"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/execution-evidence.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class ExecutionEvidence:
    business_transaction_id: str

    action: str

    target: str

    parameters: dict[str, Any]

    success: bool

    executed_at: datetime

    attributes: dict[str, Any] | None = None
