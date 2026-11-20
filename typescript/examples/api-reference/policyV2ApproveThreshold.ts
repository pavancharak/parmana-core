// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Approve a threshold
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/thresholds/erp:pay-invoice/max-amount/approve",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
