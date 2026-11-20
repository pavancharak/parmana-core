// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Replay a recorded decision
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/evidence/record-123/replay",
  {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);
console.log(response.status, await response.text());
