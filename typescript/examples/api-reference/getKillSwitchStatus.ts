const response = await fetch(
  "https://your-parmana-server/kill-switch/status?nonce=check-1",
  {
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY ?? ""}` },
  },
);

console.log(await response.json());
