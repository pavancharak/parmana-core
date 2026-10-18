"""
Parmana Model Decoder.

Decode Runtime JSON into Parmana domain models.
"""

from __future__ import annotations

import re
import types
from dataclasses import fields, is_dataclass
from datetime import datetime
from enum import Enum
from typing import Any, TypeVar, Union, cast, get_args, get_origin, get_type_hints

T = TypeVar("T")

_UNION_ORIGINS = {Union, types.UnionType}

# The attribute a decoded model keeps the server's own JSON in. Not a
# dataclass field, so it changes no equality, repr or fields(). encode()
# returns it as is, so a decoded record goes back out byte for byte as the
# server sent it: an explicit `null` (for example previousChainHash) stays
# `null` instead of being dropped as an unset field, which changed the
# canonical hash and made a valid record fail verification (G-85).
SOURCE_JSON_ATTRIBUTE = "_parmana_source_json"


def _snake(name: str) -> str:
    """
    Convert camelCase / PascalCase to snake_case.
    """

    return re.sub(
        r"(?<!^)(?=[A-Z])",
        "_",
        name,
    ).lower()


def decode(
    value: Any,
    model: type[T],
) -> T:
    """
    Decode Runtime JSON into a Parmana model.
    """

    return cast(
        T,
        _decode(
            value,
            model,
        ),
    )


def _decode(
    value: Any,
    model: Any,
) -> Any:
    """
    Recursive decoder.
    """

    if value is None:
        return None

    origin = get_origin(model)

    #
    # Optional[T] / T | None
    #
    # `get_type_hints` resolves postponed annotations, so an optional
    # field's model here is a Union, not the inner type directly. Without
    # unwrapping it, `is_dataclass(model)` and `model is datetime` below
    # never match for a populated optional field, and the raw undecoded
    # value (str, dict, ...) is silently returned instead.
    #
    if origin in _UNION_ORIGINS:

        inner_types = [arg for arg in get_args(model) if arg is not type(None)]

        if len(inner_types) == 1:
            return _decode(value, inner_types[0])

    #
    # list[T]
    #
    if origin is list:

        item_type = get_args(model)[0]

        return [_decode(item, item_type) for item in value]

    #
    # dict
    #
    if origin is dict:
        return value

    #
    # datetime
    #
    if model is datetime:

        if isinstance(value, datetime):
            return value

        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    #
    # Enum (e.g. AuthorityType, VerificationStatus, SignatureAlgorithm)
    #
    # Without this, a field typed as an Enum decodes to the raw wire
    # string instead of an actual enum member -- `isinstance(x, MyEnum)`
    # would silently be False even though equality checks against the
    # member's string value happen to still pass for str-mixin enums.
    #
    if isinstance(model, type) and issubclass(model, Enum):
        return model(value)

    #
    # dataclass
    #
    if is_dataclass(model):

        #
        # Convert Runtime JSON keys
        # camelCase -> snake_case
        #
        normalized = {_snake(key): val for key, val in value.items()}

        #
        # Resolve postponed annotations.
        #
        type_hints = get_type_hints(model)

        kwargs = {}

        for field in fields(model):

            kwargs[field.name] = _decode(
                normalized.get(field.name),
                type_hints[field.name],
            )

        # `is_dataclass` narrows to the `DataclassInstance` protocol, which
        # has no declared constructor -- this dynamic reflection-based
        # decoder has no static return type to give mypy here.
        instance = model(**kwargs)  # type: ignore[operator]

        # Frozen dataclasses refuse normal attribute assignment;
        # object.__setattr__ is the documented way around it, and the
        # attribute is not a field (see SOURCE_JSON_ATTRIBUTE).
        object.__setattr__(instance, SOURCE_JSON_ATTRIBUTE, value)

        return instance

    #
    # Primitive
    #
    return value
