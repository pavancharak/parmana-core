import json
import os
from datetime import datetime
from pathlib import Path

from parmana import ParmanaClient
from parmana.models import Signature, SignatureAlgorithm

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

# A signed audit event and its signature, as exported from caller_audit_events.
exported = json.loads(Path("audit-event.json").read_text())

signature = Signature(
    algorithm=SignatureAlgorithm(exported["signature"]["algorithm"]),
    key_id=exported["signature"]["keyId"],
    value=exported["signature"]["value"],
    signed_at=datetime.fromisoformat(exported["signature"]["signedAt"]),
)

valid = client.verify_audit_event(exported["event"], signature)

print(valid)
