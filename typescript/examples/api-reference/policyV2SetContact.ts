// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Set a contact
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/contacts",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ personId: "person-1", email: "ops@example.com" }),
  },
);
console.log(response.status, await response.text());
