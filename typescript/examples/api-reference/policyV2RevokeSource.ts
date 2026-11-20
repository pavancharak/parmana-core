// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Revoke a source
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/sources/erp-ledger/revoke",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Key rotated" }),
  },
);
console.log(response.status, await response.text());
