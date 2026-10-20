const response = await fetch("https://your-parmana-server/kill-switch/probes", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PARMANA_PROBE_KEY ?? ""}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ status: 503, errorCode: "KILL_SWITCH_ACTIVE" }),
});

console.log(await response.json());
