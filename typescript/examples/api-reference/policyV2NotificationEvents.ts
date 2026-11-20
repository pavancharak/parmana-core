// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Delivery events; clients do not call it
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/notifications/events",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ type: "Delivery" }]),
  },
);
console.log(response.status, await response.text());
