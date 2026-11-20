// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Grant a reviewer on an action
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/reviewers",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reviewerId: "reviewer-1", maxAmount: 10000 }),
  },
);
console.log(response.status, await response.text());
