"""
Parmana caller identity and public key responses.

Hand-maintained: these are the response bodies of GET /callers/me
(packages/api/src/routes/callers-me.ts) and GET /keys/{keyId}
(packages/api/src/routes/keys.ts), not named exports of @parmana/shared, so
python/scripts/generate_models.ts cannot generate them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CallerIdentity:
    """
    Who the API key belongs to and what it may do.
    """

    caller_id: str

    #: Principal IDs this key may name in a request's `authority.principalId`.
    #: Only its own caller ID unless the key lists others.
    allowed_principal_ids: list[str]

    #: Capabilities this key may request. Empty means none.
    allowed_capabilities: list[str]

    #: True when `allowed_capabilities` contains "*".
    unrestricted_capabilities: bool


@dataclass(frozen=True)
class PublicKeyInfo:
    """
    A signing public key of the deployment.
    """

    key_id: str

    algorithm: str

    use: str

    #: SPKI PEM. Pass it to the offline verifiers in `parmana.crypto`.
    pem: str

    #: The same key as a JSON Web Key, when the algorithm has a JWK form.
    jwk: dict[str, Any] | None = None
