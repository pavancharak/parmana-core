const response = await fetch(
  "https://parmana-api-real.vercel.app/handbook/download-leads?email=reader%40example.com",
);

console.log(response.status, await response.json());
