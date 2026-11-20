// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// List what is missing before go-live
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live",
  {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
