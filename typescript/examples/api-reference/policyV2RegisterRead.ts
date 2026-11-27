// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Read the register
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register",
  {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
