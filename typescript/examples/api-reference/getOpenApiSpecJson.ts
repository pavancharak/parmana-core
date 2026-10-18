const response = await fetch(
  "https://parmana-api-real.vercel.app/openapi.json",
);

console.log(response.status, await response.json());
