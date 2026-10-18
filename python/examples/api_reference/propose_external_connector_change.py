import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.external_connectors.propose_register(
    capability="erp:create-invoice",
    endpoint_url="https://erp.example.com/parmana/release",
    policy="erp-invoice",
    allowed_parameters=["amount", "currency"],
    timeout_ms=10000,
    reason="Finance creates invoices in the ERP through Parmana.",
)

print(change.change_id)
