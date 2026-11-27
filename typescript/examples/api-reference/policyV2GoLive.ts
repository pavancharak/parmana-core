// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Take an action live, if its gate is met
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
