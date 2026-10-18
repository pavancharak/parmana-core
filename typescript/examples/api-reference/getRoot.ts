const response = await fetch("https://parmana-api-real.vercel.app/", {
  headers: { Authorization: `Bearer ${process.env.PARMANA_API_KEY}` },
});

console.log(response.status, await response.json());
