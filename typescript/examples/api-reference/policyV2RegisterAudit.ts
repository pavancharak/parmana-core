// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Read the register audit log
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/audit",
  {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
