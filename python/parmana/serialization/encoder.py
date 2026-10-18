"""
Parmana Model Encoder.

Encode Parmana domain models into Runtime JSON.
"""

from __future__ import annotations

import copy
from dataclasses import fields as dataclass_fields
from dataclasses import is_dataclass
from datetime import datetime, timezone
from typing import Any

from .decoder import SOURCE_JSON_ATTRIBUTE


def _camel(name: str) -> str:
    """
    Convert snake_case to camelCase.
    """

    parts = name.split("_")

    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def encode(value: Any) -> Any:
    """
    Encode Parmana models into Runtime JSON.
    """

    #
    # Dataclass
    #
    if is_dataclass(value):
        # A model decoded from the server's JSON goes back out as exactly
        # that JSON (a copy, so the caller cannot change the model's
        # source). Rebuilding it from the fields below would drop an
        # explicit `null`, such as previousChainHash, and change a signed
        # record's canonical hash (G-85). Models are frozen, and
        # dataclasses.replace() makes a new instance without a source, so
        # a changed model is always rebuilt from its fields.
        source = getattr(value, SOURCE_JSON_ATTRIBUTE, None)
        if source is not None:
            return copy.deepcopy(source)

        # `is_dataclass` narrows to `DataclassInstance | type[DataclassInstance]`;
        # `encode()` is only ever called with instances, never a class.
        #
        # Recurses via dataclasses.fields()/getattr() rather than
        # dataclasses.asdict(): asdict() eagerly flattens every nested
        # dataclass into a plain dict *before* this function ever sees
        # it, so only the outermost level would still look like a
        # dataclass to the `is_dataclass(value)` check below -- an
        # unset `| None = None` field on any NESTED dataclass (e.g.
        # BusinessTransactionMetadata.granted_capability inside
        # BusinessTransaction.metadata) would fall through to the
        # dict branch instead, which has no None-filtering at all, and
        # get sent as an explicit JSON `null`. Recursing on real
        # attribute values instead keeps every nested dataclass a
        # genuine dataclass instance when `encode()` reaches it, so
        # the None-filtering below applies at every depth, not just
        # the top one.
        #
        # Every `| None = None` dataclass field the generator produces
        # comes from a TS *optional* (`foo?:`) property, never a
        # `| null` required one (generate_models.ts has no mapping for
        # that at all) -- so an unset field here means "absent",
        # exactly like the `undefined` JSON.stringify drops on the
        # Runtime side. Sending it back as an explicit `null` instead
        # changes what a re-hash (e.g. RefusalApi.verify(), which
        # re-hashes whatever canonical bytes it receives) computes,
        # breaking verification on a serialization difference alone,
        # not a real integrity problem -- and, as observed against a
        # live server, can also trip a strict `!== undefined` check
        # downstream (e.g. DefaultConnectorPolicy.assertAllowed's
        # grantedCapability check) that a genuinely absent key would
        # never reach at all.
        return {
            _camel(field.name): encode(getattr(value, field.name))
            for field in dataclass_fields(value)
            if getattr(value, field.name) is not None
        }

    #
    # Dictionary
    #
    if isinstance(value, dict):
        return {_camel(key): encode(item) for key, item in value.items()}

    #
    # List
    #
    if isinstance(value, list):
        return [encode(item) for item in value]

    #
    # datetime
    #
    # Matches JS's `Date.prototype.toISOString()` exactly (millisecond
    # precision, "Z" suffix) rather than Python's own `isoformat()`
    # default (microsecond precision, "+00:00" suffix): a decoded
    # RefusalRecord/ExecutionTrustRecord that gets sent straight back to
    # the Runtime (e.g. RefusalApi.verify(), which re-hashes whatever
    # canonical bytes it receives) must round-trip to the exact same
    # string the Runtime originally hashed and signed, or the signature
    # check fails on a formatting difference alone.
    if isinstance(value, datetime):
        return (
            value.astimezone(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

    #
    # Primitive
    #
    return value
