// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Propose a threshold
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/thresholds",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "erp:pay-invoice",
      name: "max-amount",
      value: 5000,
      unit: "INR",
      owner: "Finance",
      reason: "Limit payments without review",
      evidence: "Policy memo 2026-11",
      nextReview: "2027-05-01",
      highValue: true,
    }),
  },
);
console.log(response.status, await response.text());
