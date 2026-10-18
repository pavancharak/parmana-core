"""
Parmana Caller and Key API.
"""

from __future__ import annotations

from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.caller import CallerIdentity, PublicKeyInfo


class CallerApi:
    """
    Caller and Key API.

    Responsibilities
    ----------------
    - Report who the API key belongs to and what it may do
    - Fetch a signing public key, for offline verification
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def me(self) -> CallerIdentity:
        """
        Who this API key belongs to and what it may do.

        Maps to GET /callers/me. Useful to check a key before sending
        requests: which principal IDs it may act for and which capabilities
        it may request.
        """

        return self._transport.send(
            method="GET",
            path="/callers/me",
            response_model=CallerIdentity,
        )

    def public_key(
        self,
        key_id: str = "default",
    ) -> PublicKeyInfo:
        """
        A signing public key of the deployment.

        Maps to GET /keys/{keyId}. Records are signed with the key
        "default". Fetch it once, keep the PEM, and pass it to
        `parmana.crypto.verify_execution_trust_record_offline()` or
        `verify_execution_intent_offline()`. Needs no API key.
        """

        return self._transport.send(
            method="GET",
            path=f"/keys/{quote(key_id, safe='')}",
            response_model=PublicKeyInfo,
        )
