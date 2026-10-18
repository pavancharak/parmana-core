"""
Example 04

Replay a Business Transaction.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from parmana import ParmanaClient


def main() -> None:
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    transaction_file = Path(__file__).with_name(".transaction_id")

    if not transaction_file.exists():
        raise FileNotFoundError(
            "No transaction found. Run examples/02_execute.py first."
        )

    business_transaction_id = transaction_file.read_text(
        encoding="utf-8",
    ).strip()

    print(f"Business Transaction ID: {business_transaction_id}\n")

    result = client.replay.replay(
        business_transaction_id,
    )

    print(
        json.dumps(
            asdict(result),
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
