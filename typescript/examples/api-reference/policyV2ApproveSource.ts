// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Approve a source
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/sources/erp-ledger/approve",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
