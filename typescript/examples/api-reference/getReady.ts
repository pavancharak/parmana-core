const response = await fetch("https://parmana-api-real.vercel.app/ready");

console.log(response.status, await response.json());
