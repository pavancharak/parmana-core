"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/config/CryptoAlgorithms.ts, domain/signature.ts, domain/signature-entry.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class SignatureAlgorithm(str, Enum):
    ED25519 = "ed25519"
    ECDSA_P256 = "ecdsa-p256"
    DILITHIUM3 = "dilithium3"
    DILITHIUM5 = "dilithium5"
    SPHINCS_PLUS = "sphincs-plus"


@dataclass(frozen=True)
class Signature:
    algorithm: SignatureAlgorithm

    key_id: str

    value: str

    signed_at: datetime


@dataclass(frozen=True)
class SignatureEntry:
    algorithm: SignatureAlgorithm

    key_id: str

    signature: str
