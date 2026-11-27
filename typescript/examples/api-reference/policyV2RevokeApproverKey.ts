// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Revoke an approver key
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/approver-keys/approver-7/key-2026-01/revoke",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Key compromised" }),
  },
);
console.log(response.status, await response.text());
