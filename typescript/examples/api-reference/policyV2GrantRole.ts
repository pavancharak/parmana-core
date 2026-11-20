// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Grant a role
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/roles/grant",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ callerId: "caller-ops-1", role: "reviewer" }),
  },
);
console.log(response.status, await response.text());
