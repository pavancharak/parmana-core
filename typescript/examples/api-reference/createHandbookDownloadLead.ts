const response = await fetch(
  "https://parmana-api-real.vercel.app/handbook/download-leads",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com" }),
  },
);

console.log(response.status, await response.json());
