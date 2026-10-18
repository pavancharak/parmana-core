const response = await fetch(
  "https://parmana-api-real.vercel.app/.well-known/jwks.json",
  {
    headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
  },
);

console.log(response.status, await response.json());
