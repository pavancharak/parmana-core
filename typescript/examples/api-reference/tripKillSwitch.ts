const response = await fetch("https://your-parmana-server/kill-switch/trip", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PARMANA_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ reason: "suspicious refunds" }),
});

console.log(await response.json());
