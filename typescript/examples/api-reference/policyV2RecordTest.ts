// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Record a passed test tier
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/tests",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tier: "tier-1" }),
  },
);
console.log(response.status, await response.text());
