// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Approve an approver key
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/approver-keys/approver-7/key-2026-01/approve",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
