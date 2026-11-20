// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Propose a source
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/register/sources",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "erp-ledger",
      dataOwner: "Finance",
      signer: { kind: "system" },
      keyId: "erp-2026-01",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----",
      claims: { invoiceAmount: "INR" },
      canApprove: true,
    }),
  },
);
console.log(response.status, await response.text());
