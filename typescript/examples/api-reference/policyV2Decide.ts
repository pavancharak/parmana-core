// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Record a decision
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/decisions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      capability: "erp:pay-invoice",
      transactionId: "txn-1001",
      target: "invoice-7781",
      parameters: { amount: 1200 },
      signals: { vendorVerified: true },
    }),
  },
);
console.log(response.status, await response.text());
