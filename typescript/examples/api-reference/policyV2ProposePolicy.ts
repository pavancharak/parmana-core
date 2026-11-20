// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Propose a policy version. Replace {} with the policy document.
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/policies",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  },
);
console.log(response.status, await response.text());
