// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Amazon SES posts this; clients do not call it
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/notifications/ses",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Type: "Notification", Message: "{}" }),
  },
);
console.log(response.status, await response.text());
