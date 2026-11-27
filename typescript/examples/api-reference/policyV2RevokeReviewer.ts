// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Revoke a reviewer's grant
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/reviewers/reviewer-1/revoke",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Left the team" }),
  },
);
console.log(response.status, await response.text());
