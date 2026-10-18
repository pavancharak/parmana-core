const response = await fetch(
  "https://parmana-api-real.vercel.app/openapi.yaml",
);

console.log(response.status, await response.text());
