from dataclasses import dataclass


@dataclass(frozen=True)
class ClientConfig:
    """
    Parmana Client configuration.
    """

    endpoint: str
