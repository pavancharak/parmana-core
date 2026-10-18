import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

in_effect = client.policy_in_effect("paytm:refund")

print(in_effect.policy, in_effect.signals.approval)
