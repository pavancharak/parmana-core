// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Approve a policy version
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/policies/erp:pay-invoice/2.0.0/approve",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
