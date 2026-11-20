// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Propose an approver key
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/approver-keys",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      approverId: "approver-7",
      keyId: "key-2026-01",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----",
    }),
  },
);
console.log(response.status, await response.text());
