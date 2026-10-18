"""
The policy in effect for a capability, and what a request under it must
carry.

Hand-maintained: this is the response body of GET /policies/in-effect
(packages/api/src/routes/policy-in-effect.ts), not a named export of
@parmana/shared, so python/scripts/generate_models.ts cannot generate it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from parmana.models.policy import PolicyReference


@dataclass(frozen=True)
class PolicySignalRequirements:
    """
    What a request under a policy must carry. Rule conditions are not
    included. Signal names are kept exactly as the
    policy spells them.
    """

    #: Every fact the policy's rules read, sorted. Send each one in the
    #: request's `signals`.
    facts: list[str]

    #: The declared type of each signal: "boolean", "number" or "string".
    schema: dict[str, str]

    #: Signals that must equal a value of the Intent, as signal name to
    #: path, for example "refundAmount" to "parameters.amount".
    bound: dict[str, str]

    #: Signals that count as true only with a signed approval in
    #: `signals.approvalArtifact`, with where the resource ("resourceId")
    #: and, when there is one, the amount ("value") are in the request.
    approval: dict[str, dict[str, str]]

    #: Facts the server asks a business system for itself, as signal name
    #: to "source", "claim", "subject" and, if set, "maxAgeSeconds".
    #: Present only when the policy has any. You need not send them; a
    #: value you send that differs from the source's is refused.
    sourced: dict[str, dict[str, Any]] | None = None


@dataclass(frozen=True)
class PolicyInEffect:
    """
    The policy a request for a capability must declare right now.
    """

    capability: str

    #: Declare this, exactly, as the request's `policy`.
    policy: PolicyReference

    #: The policy author's description for people, or None.
    description: str | None

    signals: PolicySignalRequirements

    #: True when the policy requires it: your key needs a current
    #: authority grant for this capability, and each request must be
    #: within the grant's limits. None otherwise.
    authority_grant_required: bool | None = None
