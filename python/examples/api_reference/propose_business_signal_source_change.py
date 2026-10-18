import os
from pathlib import Path

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.business_signal_sources.propose_register(
    name="erp",
    endpoint_url="https://orders.example.com/parmana/signals",
    timeout_ms=5000,
    public_key_pem=Path("erp-answers.public.pem").read_text(),
    key_id="erp-2026-10",
    reason="Release goods only against invoices the ERP says are paid.",
)

print(change.change_id)
