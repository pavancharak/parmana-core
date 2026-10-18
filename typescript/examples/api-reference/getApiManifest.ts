const response = await fetch(
  "https://parmana-api-real.vercel.app/api-manifest.json",
);

console.log(response.status, await response.json());
