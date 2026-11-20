// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Register an action
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      capability: "erp:pay-invoice",
      owner: "Finance",
      successor: "Finance Controller",
      reviewers: ["reviewer-1"],
      review: { reviewWindowBusinessDays: 2, approvalValidityMinutes: 120 },
    }),
  },
);
console.log(response.status, await response.text());
